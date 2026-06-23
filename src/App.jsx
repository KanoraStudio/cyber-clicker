import React, { useState, useEffect, useRef } from 'react';
import { Zap, Cpu, Battery, Wifi, Radio, Volume2, VolumeX, Trophy, Users, Save, Crown, LogOut } from 'lucide-react';
import * as Tone from 'tone';
import { auth } from './firebase';
import {
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

// ============================================================
// Firestore REST API（SDKのバグを完全回避）
// ============================================================
const FS_URL = 'https://firestore.googleapis.com/v1/projects/kanoraid-studio/databases/(default)/documents';

const toFs = (val) => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFs) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFs(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
};

const fromFs = (val) => {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFs);
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) obj[k] = fromFs(v);
    return obj;
  }
  return null;
};

const fsSet = async (col, docId, data, token) => {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toFs(v);
  const res = await fetch(`${FS_URL}/${col}/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
};

const fsGet = async (col, docId, token) => {
  const res = await fetch(`${FS_URL}/${col}/${docId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status}`);
  const doc = await res.json();
  if (!doc.fields) return null;
  const data = {};
  for (const [k, v] of Object.entries(doc.fields)) data[k] = fromFs(v);
  return data;
};

// アイコンマップ（Reactコンポーネントは保存できないので別管理）
const ICON_MAP = { 1: Cpu, 2: Battery, 3: Zap, 4: Wifi, 5: Radio };

const DEFAULT_GENERATORS = [
  { id: 1, name: 'ナノボット', cost: 10, owned: 0, production: 0.1 },
  { id: 2, name: 'エネルギーコア', cost: 100, owned: 0, production: 1 },
  { id: 3, name: 'クォンタムリアクター', cost: 1000, owned: 0, production: 8 },
  { id: 4, name: 'ニューラルネット', cost: 10000, owned: 0, production: 50 },
  { id: 5, name: 'ディメンションゲート', cost: 100000, owned: 0, production: 500 }
];

const addIcons = (generators) => generators.map(g => ({ ...g, icon: ICON_MAP[g.id] || Cpu }));
const removeIcons = (generators) => generators.map(({ icon, ...g }) => g);

export default function CyberClicker() {
  const [energy, setEnergy] = useState(0);
  const [clickPower, setClickPower] = useState(1);
  const [totalClicks, setTotalClicks] = useState(0);
  const [autoGenerators, setAutoGenerators] = useState(addIcons(DEFAULT_GENERATORS));
  const [clickUpgrades] = useState([
    { id: 1, name: 'サイバー強化', cost: 50, multiplier: 2 },
    { id: 2, name: 'バイオニック義手', cost: 500, multiplier: 5 },
    { id: 3, name: 'ニューロリンク', cost: 5000, multiplier: 10 },
    { id: 4, name: 'トランスヒューマン', cost: 50000, multiplier: 50 }
  ]);
  const [purchasedUpgrades, setPurchasedUpgrades] = useState([]);
  const [clickAnimation, setClickAnimation] = useState(false);
  const [glitchEffect, setGlitchEffect] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);

  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');

  const [showLoginModal, setShowLoginModal] = useState(true);
  const [loginMode, setLoginMode] = useState('select');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const synthRef = useRef(null);
  const bassRef = useRef(null);
  const noiseRef = useRef(null);
  const reverbRef = useRef(null);
  const loopRef = useRef(null);
  const ambienceLoopRef = useRef(null);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setShowLoginModal(false);
        await loadUserData(currentUser);
      } else {
        setUser(null);
        setShowLoginModal(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // リーダーボードをREST APIで取得（10秒ごと）
  const loadLeaderboard = async () => {
    try {
      const url = `${FS_URL}:runQuery`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'leaderboard' }],
            orderBy: [{ field: { fieldPath: 'highScore' }, direction: 'DESCENDING' }],
            limit: 10
          }
        })
      });
      const rows = await res.json();
      const leaders = rows
        .filter(r => r.document)
        .map(r => {
          const f = r.document.fields || {};
          const id = r.document.name.split('/').pop();
          return {
            id,
            username: f.username?.stringValue || 'Anonymous',
            highScore: Number(f.highScore?.integerValue || f.highScore?.doubleValue || 0)
          };
        });
      setLeaderboard(leaders);
    } catch (e) {
      console.error('Leaderboard load error:', e);
    }
  };

  useEffect(() => {
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadUserData = async (currentUser) => {
    try {
      const token = await currentUser.getIdToken();

      // ユーザー名を読み込み
      const userData = await fsGet('users', currentUser.uid, token);
      let name = userData?.username || currentUser.displayName || '';
      setUsername(name);

      // セーブデータを読み込み
      const saveData = await fsGet('saves', currentUser.uid, token);
      if (saveData) {
        setEnergy(saveData.energy || 0);
        setClickPower(saveData.clickPower || 1);
        setTotalClicks(saveData.totalClicks || 0);
        if (saveData.autoGenerators) setAutoGenerators(addIcons(saveData.autoGenerators));
        if (saveData.purchasedUpgrades) setPurchasedUpgrades(saveData.purchasedUpgrades);
        setHighScore(saveData.highScore || 0);
      }
    } catch (error) {
      console.error('Load error:', error);
    }
  };

  const saveGameData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const currentScore = Math.floor(energy);
      const newHighScore = Math.max(highScore, currentScore);

      // セーブデータを保存（アイコンを除外）
      await fsSet('saves', user.uid, {
        energy,
        clickPower,
        totalClicks,
        autoGenerators: removeIcons(autoGenerators),
        purchasedUpgrades,
        highScore: newHighScore,
        lastSaved: new Date().toISOString()
      }, token);

      // リーダーボード更新
      if (username && currentScore > highScore) {
        try {
          await fsSet('leaderboard', user.uid, {
            username,
            highScore: currentScore,
            updatedAt: new Date().toISOString()
          }, token);
          setHighScore(currentScore);
        } catch (e) {
          console.error('Leaderboard update failed:', e);
        }
      }

      setSaveStatus('保存完了 ✓');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('保存失敗: ' + error.message);
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  // 自動保存（30秒ごと）
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(saveGameData, 30000);
    return () => clearInterval(interval);
  }, [user, energy, clickPower, totalClicks, autoGenerators, purchasedUpgrades, highScore, username]);

  const handleGoogleLogin = async () => {
    try {
      setLoginError('');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user.displayName) {
        const token = await result.user.getIdToken();
        const displayName = result.user.displayName;
        await fsSet('users', result.user.uid, {
          username: displayName,
          email: result.user.email,
          createdAt: new Date().toISOString()
        }, token);
        await fsSet('leaderboard', result.user.uid, {
          username: displayName,
          highScore: 0,
          updatedAt: new Date().toISOString()
        }, token);
      }
    } catch (error) {
      console.error('Google login error:', error);
      setLoginError('Googleログインに失敗しました: ' + error.code);
    }
  };

  const handleEmailSignup = async () => {
    try {
      setLoginError('');
      if (!email || !password) { setLoginError('メールとパスワードを入力してください'); return; }
      if (password.length < 6) { setLoginError('パスワードは6文字以上'); return; }
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') setLoginError('このメールは既に使用されています');
      else setLoginError('アカウント作成に失敗しました: ' + error.code);
    }
  };

  const handleEmailLogin = async () => {
    try {
      setLoginError('');
      if (!email || !password) { setLoginError('メールとパスワードを入力してください'); return; }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setLoginError('メールまたはパスワードが正しくありません');
    }
  };

  const handleAnonymousLogin = async () => {
    try {
      setLoginError('');
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Anonymous login error:', error);
      setLoginError('ゲストログインに失敗しました: ' + error.code);
    }
  };

  const handleLogout = async () => {
    await saveGameData();
    await signOut(auth);
    setEnergy(0); setClickPower(1); setTotalClicks(0);
    setAutoGenerators(addIcons(DEFAULT_GENERATORS));
    setPurchasedUpgrades([]); setUsername(''); setHighScore(0);
  };

  const setUserUsername = async () => {
    if (!user || !usernameInput.trim()) return;
    try {
      const token = await user.getIdToken();
      const name = usernameInput.trim();
      await fsSet('users', user.uid, { username: name, createdAt: new Date().toISOString() }, token);
      await fsSet('leaderboard', user.uid, {
        username: name,
        highScore: Math.floor(energy),
        updatedAt: new Date().toISOString()
      }, token);
      setUsername(name);
      setUsernameInput('');
      setShowUsernameInput(false);
    } catch (error) {
      console.error('Username error:', error);
      alert('ユーザー名の設定に失敗しました');
    }
  };

  // オーディオ初期化
  const initAudio = async () => {
    if (audioStarted) return;
    await Tone.start();
    setAudioStarted(true);
    reverbRef.current = new Tone.Reverb({ decay: 3, wet: 0.3 }).toDestination();
    synthRef.current = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 } }).connect(reverbRef.current);
    bassRef.current = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 4 }).toDestination();
    noiseRef.current = new Tone.Noise("pink").connect(new Tone.Filter(2000, "lowpass").toDestination());
    const ambientSynth = new Tone.PolySynth(Tone.Synth).connect(reverbRef.current);
    loopRef.current = new Tone.Loop((time) => {
      const notes = ["C2", "G2", "A#2", "F2"];
      ambientSynth.triggerAttackRelease(notes[Math.floor(Math.random() * notes.length)], "2n", time, 0.1);
    }, "2n");
    const beepSynth = new Tone.Synth({ oscillator: { type: "square" } }).connect(reverbRef.current);
    ambienceLoopRef.current = new Tone.Loop((time) => {
      if (Math.random() > 0.7) {
        const notes = ["C5", "D5", "E5", "G5", "A5"];
        beepSynth.triggerAttackRelease(notes[Math.floor(Math.random() * notes.length)], "32n", time, 0.05);
      }
    }, "16n");
  };

  const toggleSound = async () => {
    if (!audioStarted) await initAudio();
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) { Tone.Transport.start(); loopRef.current?.start(0); ambienceLoopRef.current?.start(0); }
    else { loopRef.current?.stop(); ambienceLoopRef.current?.stop(); }
  };

  const playClickSound = () => { if (!soundEnabled || !synthRef.current) return; const notes = ["C4", "E4", "G4", "C5"]; synthRef.current.triggerAttackRelease(notes[Math.floor(Math.random() * notes.length)], "16n"); };
  const playPurchaseSound = () => { if (!soundEnabled || !bassRef.current) return; bassRef.current.triggerAttackRelease("C2", "8n"); setTimeout(() => synthRef.current?.triggerAttackRelease("C5", "32n"), 100); };
  const playUpgradeSound = () => { if (!soundEnabled || !synthRef.current) return; ["C5", "E5", "G5", "C6"].forEach((note, i) => setTimeout(() => synthRef.current?.triggerAttackRelease(note, "32n"), i * 50)); };
  const playHoverSound = () => { if (soundEnabled && synthRef.current) synthRef.current.triggerAttackRelease("G4", "64n", undefined, 0.02); };

  // 自動生産（1秒ごと）
  useEffect(() => {
    const interval = setInterval(() => {
      const totalProduction = autoGenerators.reduce((sum, gen) => sum + (gen.production * gen.owned), 0);
      if (totalProduction > 0) setEnergy(prev => prev + totalProduction);
    }, 1000);
    return () => clearInterval(interval);
  }, [autoGenerators]);

  // グリッチエフェクト
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.95) { setGlitchEffect(true); setTimeout(() => setGlitchEffect(false), 100); }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    setEnergy(prev => prev + clickPower);
    setTotalClicks(prev => prev + 1);
    setClickAnimation(true);
    playClickSound();
    setTimeout(() => setClickAnimation(false), 300);
  };

  const buyGenerator = (generator) => {
    if (energy >= generator.cost) {
      setEnergy(prev => prev - generator.cost);
      setAutoGenerators(prev => prev.map(gen =>
        gen.id === generator.id ? { ...gen, owned: gen.owned + 1, cost: Math.floor(gen.cost * 1.15) } : gen
      ));
      playPurchaseSound();
    }
  };

  const buyUpgrade = (upgrade) => {
    if (energy >= upgrade.cost && !purchasedUpgrades.includes(upgrade.id)) {
      setEnergy(prev => prev - upgrade.cost);
      setClickPower(prev => prev * upgrade.multiplier);
      setPurchasedUpgrades(prev => [...prev, upgrade.id]);
      playUpgradeSound();
    }
  };

  const totalPerSecond = autoGenerators.reduce((sum, gen) => sum + (gen.production * gen.owned), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white overflow-hidden relative">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-fuchsia-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-violet-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#00ffff 1px, transparent 1px), linear-gradient(90deg, #00ffff 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>

      {/* ログインモーダル */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 border-4 border-cyan-500 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-cyan-500/50">
            <h2 className="text-4xl font-black mb-2 text-center" style={{ fontFamily: '"Orbitron", monospace', textShadow: '0 0 20px #00ffff' }}>CYBER FACTORY</h2>
            <p className="text-center text-cyan-400 mb-8" style={{ fontFamily: '"Share Tech Mono", monospace' }}>// ログインして開始 //</p>
            {loginMode === 'select' && (
              <div className="space-y-4">
                <button onClick={handleGoogleLogin} className="w-full px-6 py-4 bg-white text-gray-800 rounded-lg font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-3">
                  <svg className="w-6 h-6" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Googleでログイン
                </button>
                <button onClick={() => setLoginMode('email-login')} className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg font-bold hover:opacity-90 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>メールでログイン</button>
                <button onClick={() => setLoginMode('email-signup')} className="w-full px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg font-bold hover:opacity-90 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>新規アカウント作成</button>
                <div className="relative my-4"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-600"></div></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-slate-900 text-gray-400">または</span></div></div>
                <button onClick={handleAnonymousLogin} className="w-full px-6 py-4 bg-gray-700 rounded-lg font-bold hover:bg-gray-600 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>ゲストとしてプレイ</button>
                {loginError && <div className="px-4 py-2 bg-red-900/50 border border-red-500 rounded text-red-300 text-sm">{loginError}</div>}
              </div>
            )}
            {loginMode === 'email-login' && (
              <div className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full px-4 py-3 bg-black/50 border-2 border-cyan-500/50 rounded-lg text-white focus:outline-none focus:border-cyan-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" className="w-full px-4 py-3 bg-black/50 border-2 border-cyan-500/50 rounded-lg text-white focus:outline-none focus:border-cyan-400" onKeyPress={(e) => e.key === 'Enter' && handleEmailLogin()} />
                {loginError && <div className="px-4 py-2 bg-red-900/50 border border-red-500 rounded text-red-300 text-sm">{loginError}</div>}
                <button onClick={handleEmailLogin} className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-lg font-bold hover:opacity-90 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>ログイン</button>
                <button onClick={() => { setLoginMode('select'); setLoginError(''); }} className="w-full px-6 py-3 bg-gray-700 rounded-lg font-bold hover:bg-gray-600 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>戻る</button>
              </div>
            )}
            {loginMode === 'email-signup' && (
              <div className="space-y-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className="w-full px-4 py-3 bg-black/50 border-2 border-cyan-500/50 rounded-lg text-white focus:outline-none focus:border-cyan-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード（6文字以上）" className="w-full px-4 py-3 bg-black/50 border-2 border-cyan-500/50 rounded-lg text-white focus:outline-none focus:border-cyan-400" onKeyPress={(e) => e.key === 'Enter' && handleEmailSignup()} />
                {loginError && <div className="px-4 py-2 bg-red-900/50 border border-red-500 rounded text-red-300 text-sm">{loginError}</div>}
                <button onClick={handleEmailSignup} className="w-full px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg font-bold hover:opacity-90 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>アカウント作成</button>
                <button onClick={() => { setLoginMode('select'); setLoginError(''); }} className="w-full px-6 py-3 bg-gray-700 rounded-lg font-bold hover:bg-gray-600 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>戻る</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ヘッダーボタン */}
      <div className="fixed top-4 right-4 z-50 flex gap-3">
        <button onClick={toggleSound} className="p-4 bg-black/60 backdrop-blur-md border-2 border-cyan-500/50 rounded-full hover:border-cyan-400 transition-all">{soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}</button>
        <button onClick={() => setShowLeaderboard(!showLeaderboard)} className="p-4 bg-black/60 backdrop-blur-md border-2 border-yellow-500/50 rounded-full hover:border-yellow-400 transition-all"><Trophy className="w-6 h-6" /></button>
        <button onClick={saveGameData} className="p-4 bg-black/60 backdrop-blur-md border-2 border-green-500/50 rounded-full hover:border-green-400 transition-all"><Save className="w-6 h-6" /></button>
        {user && !username && <button onClick={() => setShowUsernameInput(true)} className="p-4 bg-black/60 backdrop-blur-md border-2 border-fuchsia-500/50 rounded-full hover:border-fuchsia-400 transition-all"><Users className="w-6 h-6" /></button>}
        {user && <button onClick={handleLogout} className="p-4 bg-black/60 backdrop-blur-md border-2 border-red-500/50 rounded-full hover:border-red-400 transition-all"><LogOut className="w-6 h-6" /></button>}
      </div>

      {saveStatus && <div className={`fixed top-20 right-4 z-50 px-4 py-2 bg-black/80 backdrop-blur-md border-2 rounded-lg ${saveStatus.includes('✓') ? 'border-green-500/50 text-green-400' : 'border-red-500/50 text-red-400'}`}>{saveStatus}</div>}

      {/* ユーザー名設定モーダル */}
      {showUsernameInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 border-4 border-cyan-500 rounded-2xl p-8 max-w-md w-full mx-4">
            <h2 className="text-3xl font-black mb-6 text-center" style={{ fontFamily: '"Orbitron", monospace', textShadow: '0 0 20px #00ffff' }}>ユーザー名を設定</h2>
            <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="ユーザー名を入力" maxLength={20} className="w-full px-4 py-3 bg-black/50 border-2 border-cyan-500/50 rounded-lg text-white text-lg mb-4 focus:outline-none focus:border-cyan-400" onKeyPress={(e) => e.key === 'Enter' && setUserUsername()} />
            <div className="flex gap-3">
              <button onClick={setUserUsername} className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 rounded-lg font-bold hover:opacity-90 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>設定</button>
              <button onClick={() => { setShowUsernameInput(false); setUsernameInput(''); }} className="flex-1 px-6 py-3 bg-gray-700 rounded-lg font-bold hover:bg-gray-600 transition-all" style={{ fontFamily: '"Orbitron", monospace' }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* リーダーボード */}
      {showLeaderboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-br from-slate-900 to-purple-900 border-4 border-yellow-500 rounded-2xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-4xl font-black" style={{ fontFamily: '"Orbitron", monospace', textShadow: '0 0 20px #ffff00' }}><Trophy className="inline mr-3 w-10 h-10" />LEADERBOARD</h2>
              <button onClick={() => setShowLeaderboard(false)} className="text-3xl hover:text-red-400 transition-all">×</button>
            </div>
            <div className="space-y-3">
              {leaderboard.length === 0
                ? <p className="text-center text-gray-400 py-8">まだランキングがありません</p>
                : leaderboard.map((leader, index) => (
                  <div key={leader.id} className={`p-4 rounded-xl border-2 ${leader.id === user?.uid ? 'bg-gradient-to-r from-purple-900/70 to-fuchsia-900/70 border-fuchsia-500' : 'bg-black/40 border-yellow-500/30'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`text-3xl font-black ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? <Crown className="inline w-8 h-8" /> : null}#{index + 1}
                        </div>
                        <div>
                          <div className="font-bold text-xl" style={{ fontFamily: '"Orbitron", monospace' }}>{leader.username}</div>
                          {leader.id === user?.uid && <div className="text-xs text-cyan-400">あなた</div>}
                        </div>
                      </div>
                      <div className="text-2xl font-black text-yellow-400">{leader.highScore.toLocaleString()}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className={`text-6xl md:text-7xl font-black mb-4 tracking-wider ${glitchEffect ? 'glitch' : ''}`} style={{ fontFamily: '"Orbitron", monospace', textShadow: '0 0 20px #00ffff, 0 0 40px #ff00ff' }}>CYBER FACTORY</h1>
          <div className="text-xl md:text-2xl font-light tracking-widest" style={{ fontFamily: '"Share Tech Mono", monospace' }}>// システム起動中 //</div>
          {user && <div className="mt-2 text-lg">{username ? <span className="text-fuchsia-400">PLAYER: {username}</span> : user.email ? <span className="text-cyan-400">{user.email}</span> : <span className="text-gray-400">GUEST USER</span>}</div>}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-black/40 backdrop-blur-md border-2 border-cyan-500/50 rounded-2xl p-6 md:p-8 shadow-2xl shadow-cyan-500/20">
            <div className="text-center mb-6">
              <div className="text-sm tracking-widest text-cyan-400 mb-2">TOTAL ENERGY</div>
              <div className="text-4xl md:text-6xl font-black mb-2" style={{ fontFamily: '"Orbitron", monospace', textShadow: '0 0 10px #00ffff' }}>{Math.floor(energy).toLocaleString()}</div>
              <div className="text-lg text-fuchsia-400">+{totalPerSecond.toFixed(1)}/秒</div>
              <div className="text-sm text-gray-400 mt-2">総クリック数: {totalClicks.toLocaleString()}</div>
            </div>
            <button onClick={handleClick} className={`w-full aspect-square bg-gradient-to-br from-cyan-500 via-purple-500 to-fuchsia-500 rounded-full shadow-2xl shadow-purple-500/50 border-4 border-white/20 transform transition-all duration-300 hover:scale-105 active:scale-95 ${clickAnimation ? 'scale-110 ring-4 ring-cyan-400' : ''}`} style={{ boxShadow: '0 0 60px rgba(168, 85, 247, 0.8)' }}>
              <div className="flex flex-col items-center justify-center h-full">
                <Zap className={`w-16 h-16 md:w-24 md:h-24 mb-4 ${clickAnimation ? 'animate-ping' : 'animate-pulse'}`} />
                <div className="text-2xl md:text-3xl font-black" style={{ fontFamily: '"Orbitron", monospace' }}>GENERATE</div>
                <div className="text-lg md:text-xl mt-2">+{clickPower.toLocaleString()}/クリック</div>
              </div>
            </button>
          </div>

          <div className="bg-black/40 backdrop-blur-md border-2 border-fuchsia-500/50 rounded-2xl p-6 shadow-2xl shadow-fuchsia-500/20">
            <h2 className="text-xl md:text-2xl font-black mb-4 tracking-wider border-b-2 border-fuchsia-500/50 pb-3" style={{ fontFamily: '"Orbitron", monospace' }}>// GENERATORS //</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {autoGenerators.map(generator => {
                const Icon = generator.icon;
                const canAfford = energy >= generator.cost;
                return (
                  <button key={generator.id} onClick={() => buyGenerator(generator)} onMouseEnter={playHoverSound} disabled={!canAfford} className={`w-full p-3 md:p-4 rounded-xl border-2 transition-all duration-300 ${canAfford ? 'bg-gradient-to-r from-purple-900/50 to-fuchsia-900/50 border-fuchsia-500/70 hover:border-fuchsia-400 hover:scale-102' : 'bg-gray-900/30 border-gray-700/50 opacity-50 cursor-not-allowed'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-6 h-6 md:w-8 md:h-8 text-fuchsia-400 ${generator.owned > 0 ? 'animate-pulse' : ''}`} />
                        <div className="text-left">
                          <div className="font-bold" style={{ fontFamily: '"Orbitron", monospace' }}>{generator.name}</div>
                          <div className="text-xs text-cyan-400">+{generator.production}/秒</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-yellow-400">{generator.cost.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">所有: {generator.owned}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-md border-2 border-yellow-500/50 rounded-2xl p-6 shadow-2xl shadow-yellow-500/20">
          <h2 className="text-xl md:text-2xl font-black mb-4 tracking-wider border-b-2 border-yellow-500/50 pb-3" style={{ fontFamily: '"Orbitron", monospace' }}>// CLICK UPGRADES //</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {clickUpgrades.map(upgrade => {
              const canAfford = energy >= upgrade.cost;
              const isPurchased = purchasedUpgrades.includes(upgrade.id);
              return (
                <button key={upgrade.id} onClick={() => buyUpgrade(upgrade)} onMouseEnter={playHoverSound} disabled={!canAfford || isPurchased} className={`p-4 rounded-xl border-2 transition-all duration-300 ${isPurchased ? 'bg-green-900/30 border-green-500/50' : canAfford ? 'bg-gradient-to-br from-yellow-900/50 to-orange-900/50 border-yellow-500/70 hover:border-yellow-400 hover:scale-105' : 'bg-gray-900/30 border-gray-700/50 opacity-50 cursor-not-allowed'}`}>
                  <div className="font-bold mb-2" style={{ fontFamily: '"Orbitron", monospace' }}>{upgrade.name}</div>
                  <div className="text-sm text-cyan-400 mb-2">クリック力 x{upgrade.multiplier}</div>
                  {isPurchased ? <div className="text-green-400 font-bold">✓ 購入済み</div> : <div className="text-yellow-400 font-bold">{upgrade.cost.toLocaleString()}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        @keyframes blob { 0%, 100% { transform: translate(0,0) scale(1); } 33% { transform: translate(30px,-50px) scale(1.1); } 66% { transform: translate(-20px,20px) scale(0.9); } }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        .glitch { animation: glitch 0.3s infinite; }
        @keyframes glitch { 0% { transform: translate(0); } 20% { transform: translate(-2px,2px); } 40% { transform: translate(-2px,-2px); } 60% { transform: translate(2px,2px); } 80% { transform: translate(2px,-2px); } 100% { transform: translate(0); } }
        .hover\\:scale-102:hover { transform: scale(1.02); }
      `}</style>
    </div>
  );
}
