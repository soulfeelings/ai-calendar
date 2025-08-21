#!/usr/bin/env python3
"""
Webhook сервер для автоматического развертывания AI Calendar
при получении push событий в ветку main
"""

import hmac
import hashlib
import subprocess
import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f"{os.environ.get("PROJECT_PATH")}/webhook.log"),
        logging.StreamHandler()
    ]
)

# Конфигурация
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', 'your_webhook_secret_here')
DEPLOY_SCRIPT_PATH = os.environ.get("DEPLOY_SCRIPT_PATH")
PORT = int(os.environ.get('WEBHOOK_PORT', 9000))

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        """Обработка POST запросов от GitHub"""
        if self.path != '/webhook':
            self.send_response(404)
            self.end_headers()
            return

        # Получаем длину контента
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        # Проверяем подпись (если настроена)
        if WEBHOOK_SECRET != 'your_webhook_secret_here':
            signature = self.headers.get('X-Hub-Signature-256')
            if not self.verify_signature(post_data, signature):
                logging.warning("Неверная подпись webhook")
                self.send_response(401)
                self.end_headers()
                return

        try:
            # Парсим JSON
            payload = json.loads(post_data.decode('utf-8'))

            # Проверяем, что это push в main ветку
            if (payload.get('ref') == 'refs/heads/main' and
                payload.get('action') != 'closed'):

                logging.info(f"Получен push в main ветку от {payload.get('pusher', {}).get('name', 'unknown')}")

                # Запускаем скрипт развертывания
                self.deploy()

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Deployment started"}')
            else:
                logging.info(f"Игнорируем webhook: ref={payload.get('ref')}")
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "ignored", "message": "Not a main branch push"}')

        except json.JSONDecodeError:
            logging.error("Ошибка парсинга JSON")
            self.send_response(400)
            self.end_headers()
        except Exception as e:
            logging.error(f"Ошибка обработки webhook: {e}")
            self.send_response(500)
            self.end_headers()

    def verify_signature(self, payload_body, signature_header):
        """Проверка подписи GitHub webhook"""
        if not signature_header:
            return False

        hash_object = hmac.new(
            WEBHOOK_SECRET.encode('utf-8'),
            msg=payload_body,
            digestmod=hashlib.sha256
        )
        expected_signature = "sha256=" + hash_object.hexdigest()

        return hmac.compare_digest(expected_signature, signature_header)

    def deploy(self):
        """Запуск скрипта развертывания"""
        try:
            logging.info("Запускаем скрипт развертывания...")
            result = subprocess.run(
                [DEPLOY_SCRIPT_PATH],
                capture_output=True,
                text=True,
                timeout=300  # 5 минут таймаут
            )

            if result.returncode == 0:
                logging.info("Развертывание завершено успешно")
                logging.info(f"Вывод: {result.stdout}")
            else:
                logging.error(f"Ошибка развертывания: {result.stderr}")

        except subprocess.TimeoutExpired:
            logging.error("Таймаут выполнения скрипта развертывания")
        except Exception as e:
            logging.error(f"Ошибка запуска скрипта развертывания: {e}")

    def log_message(self, format, *args):
        """Переопределяем логирование запросов"""
        logging.info(f"{self.address_string()} - {format % args}")

def run_server():
    """Запуск webhook сервера"""
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, WebhookHandler)

    logging.info(f"Webhook сервер запущен на порту {PORT}")
    logging.info(f"Эндпоинт: http://localhost:{PORT}/webhook")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logging.info("Получен сигнал остановки")
        httpd.server_close()
        logging.info("Webhook сервер остановлен")

if __name__ == '__main__':
    run_server()
