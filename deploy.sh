#!/bin/bash

# Скрипт автоматического развертывания AI Calendar
# Использование: ./deploy.sh

set -e

PROJECT_DIR="/opt/ai-calendar"
LOG_FILE="$PROJECT_DIR/deploy.log"

# Функция логирования
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Начинаем процесс развертывания..."

# Переходим в директорию проекта
cd "$PROJECT_DIR"

# Сохраняем текущую ветку
CURRENT_BRANCH=$(git branch --show-current)
log "Текущая ветка: $CURRENT_BRANCH"

# Получаем последние изменения
log "Получаем последние изменения из репозитория..."
git fetch origin

# Проверяем, есть ли изменения в ветке main
BEHIND=$(git rev-list HEAD..origin/main --count)
if [ "$BEHIND" -eq 0 ]; then
    log "Нет новых изменений в ветке main. Развертывание не требуется."
    exit 0
fi

log "Найдено $BEHIND новых коммитов. Начинаем развертывание..."

# Переключаемся на ветку main и получаем изменения
log "Переключаемся на ветку main..."
git checkout main
git pull origin main

# Останавливаем текущие контейнеры
log "Останавливаем существующие контейнеры..."
docker-compose down

# Удаляем старые образы (опционально)
log "Удаляем неиспользуемые образы..."
docker system prune -f

# Собираем новые образы
log "Собираем новые образы..."
log "Запускаем контейнеры..."
docker-compose -f docker.compose.yml --env-file .env up --build --no-cache

# Проверяем статус контейнеров
log "Проверяем статус контейнеров..."
sleep 10
docker-compose ps

# Проверяем логи для выявления ошибок
log "Проверяем логи backend'а..."
docker-compose logs --tail=20 backend

# Проверяем и перезапускаем nginx если нужно
if systemctl is-active --quiet nginx; then
    log "Проверяем конфигурацию nginx..."
    if nginx -t > /dev/null 2>&1; then
        log "Перезапускаем nginx..."
        systemctl reload nginx
    else
        log "ПРЕДУПРЕЖДЕНИЕ: Ошибка в конфигурации nginx, пропускаем перезапуск"
    fi
else
    log "Nginx не запущен или не установлен, пропускаем проверку"
fi

log "Развертывание завершено успешно!"

# Возвращаемся на исходную ветку (если была не main)
if [ "$CURRENT_BRANCH" != "main" ]; then
    git checkout "$CURRENT_BRANCH"
fi
