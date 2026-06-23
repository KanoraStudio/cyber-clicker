#!/bin/bash

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🚀 GitHub Pages デプロイツール     ║"
echo "╚══════════════════════════════════════╝"
echo ""

# 現在のディレクトリにpackage.jsonがあるか確認
if [ ! -f "package.json" ]; then
  echo "❌ エラー: このフォルダにpackage.jsonが見つかりません。"
  echo "   デプロイしたいプロジェクトのフォルダで実行してください。"
  echo ""
  echo "   例: cd ~/Downloads/cyber-clicker"
  echo "       githubdeploy.sh"
  exit 1
fi

# GitHubのURLを入力
echo "GitHubリポジトリのURLを入力してください"
echo "例: https://github.com/kanoraID/cyber-clicker.git"
echo ""
read -p "URL: " REPO_URL

if [ -z "$REPO_URL" ]; then
  echo "❌ URLが入力されていません。終了します。"
  exit 1
fi

echo ""
echo "────────────────────────────────────────"
echo "[1/5] 📦 古いファイルを削除中..."
rm -rf node_modules package-lock.json

echo "[2/5] 📥 パッケージをインストール中..."
npm install
if [ $? -ne 0 ]; then
  echo "❌ npm installに失敗しました。"
  exit 1
fi

echo "[3/5] 🔧 Gitを設定中..."
git init
git add .
git commit -m "Deploy $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || git commit --allow-empty -m "Deploy"
git branch -M main
git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL"

echo "[4/5] ⬆️  GitHubにプッシュ中..."
git push -u origin main --force
if [ $? -ne 0 ]; then
  echo "❌ GitHubへのプッシュに失敗しました。"
  echo "   GitHubにログインしているか確認してください。"
  exit 1
fi

echo "[5/5] 🌐 GitHub Pagesにデプロイ中..."
npm run deploy
if [ $? -ne 0 ]; then
  echo "❌ デプロイに失敗しました。"
  exit 1
fi

echo ""
echo "────────────────────────────────────────"
echo "✅ デプロイ完了！"
echo ""
REPO_PATH=$(echo "$REPO_URL" | sed 's/https:\/\/github.com\///' | sed 's/\.git//')
USER_NAME=$(echo "$REPO_PATH" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO_PATH" | cut -d'/' -f2)
echo "🔗 公開URL:"
echo "   https://$USER_NAME.github.io/$REPO_NAME/"
echo ""
echo "※ 反映まで数分かかる場合があります"
echo "────────────────────────────────────────"
echo ""
