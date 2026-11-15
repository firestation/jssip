#!/usr/bin/env bash
# Собирает демо JsSIP и выкладывает статику на сервер.
# Запускается С РАБОЧЕЙ МАШИНЫ, из корня проекта.
#
#   ./deploy/deploy.sh
#
# Хост и каталог — через окружение или .env:
#   HOST=app.example.com KEY=~/.ssh/id_ed25519 APP_DIR=/var/www/jssip ./deploy/deploy.sh
#
# Скрипт только копирует файлы. Настройка веб-сервера, HTTPS и ограничение
# доступа — вне приложения и вне этого скрипта: их каждый делает под себя.
set -eu pipefail

# Подхватываем .env, если он есть (переменные окружения главнее)
if [ -f .env ]; then
	set -a
	. ./.env
	set +a
fi

HOST=${HOST:?укажите HOST=ваш.сервер (или задайте в .env)}
KEY=${KEY:-$HOME/.ssh/id_ed25519}
APP_DIR=${APP_DIR:-/var/www/jssip}
RSYNC=(rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new")

cd "$(dirname "$0")/.."

echo "→ сборка"
npx gulp prod

echo "→ выкладка статики в $APP_DIR"
"${RSYNC[@]}" ./out/ "root@$HOST:$APP_DIR/"

echo
echo "Готово: файлы в $APP_DIR на $HOST"
