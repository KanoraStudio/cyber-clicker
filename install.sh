#!/bin/bash

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ⚙️  デプロイツール インストール    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# githubdeploy.shを/usr/local/binにコピー
echo "[1/3] スクリプトをインストール中..."
sudo cp githubdeploy.sh /usr/local/bin/githubdeploy.sh
sudo chmod +x /usr/local/bin/githubdeploy.sh

# startコマンドを~/.zshrcに追加
echo "[2/3] startコマンドを設定中..."
ZSHRC="$HOME/.zshrc"

# 既に追加済みか確認
if grep -q "# GitHub Deploy Tool" "$ZSHRC" 2>/dev/null; then
  echo "   すでに設定済みです。スキップします。"
else
  echo "" >> "$ZSHRC"
  echo "# GitHub Deploy Tool" >> "$ZSHRC"
  echo "start() { bash \"\$1\"; }" >> "$ZSHRC"
fi

# 設定を反映
echo "[3/3] 設定を反映中..."
source "$ZSHRC" 2>/dev/null

echo ""
echo "────────────────────────────────────────"
echo "✅ インストール完了！"
echo ""
echo "使い方（どこからでも実行できます）:"
echo ""
echo "  cd プロジェクトのフォルダ"
echo "  start githubdeploy.sh"
echo ""
echo "または:"
echo "  githubdeploy.sh"
echo ""
echo "※ 新しいターミナルを開いて実行してください"
echo "────────────────────────────────────────"
echo ""
