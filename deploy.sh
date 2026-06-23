#!/bin/bash

echo "=================================="
echo "  Cyber Factory デプロイスクリプト"
echo "=================================="
echo ""

# GitHubのURLを入力
read -p "GitHubリポジトリのURL (例: https://github.com/kanoraID/cyber-clicker.git): " REPO_URL

if [ -z "$REPO_URL" ]; then
  echo "URLが入力されていません。終了します。"
  exit 1
fi

echo ""
echo "URL: $REPO_URL"
echo "デプロイを開始します..."
echo ""

# 古いnode_modulesを削除して再インストール
echo "[1/5] 古いファイルを削除中..."
rm -rf node_modules package-lock.json

echo "[2/5] パッケージをインストール中..."
npm install

echo "[3/5] Gitを初期化中..."
git init
git add .
git commit -m "Deploy Cyber Factory" 2>/dev/null || git commit --allow-empty -m "Deploy Cyber Factory"
git branch -M main

# リモートが既に設定されている場合は上書き
git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL"

echo "[4/5] GitHubにプッシュ中..."
git push -u origin main --force

echo "[5/5] GitHub Pagesにデプロイ中..."
npm run deploy

echo ""
echo "=================================="
echo "  デプロイ完了！"
echo "=================================="
echo ""
echo "数分後に以下にアクセスしてください："
# URLからユーザー名とリポジトリ名を抽出して表示
REPO_PATH=$(echo "$REPO_URL" | sed 's/https:\/\/github.com\///' | sed 's/\.git//')
USER_NAME=$(echo "$REPO_PATH" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO_PATH" | cut -d'/' -f2)
echo "  https://$USER_NAME.github.io/$REPO_NAME/"
echo ""
