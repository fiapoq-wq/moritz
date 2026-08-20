# Moritz Payments API — Azure VM

Este serviço conecta a interface privada da Leticia à MisticPay sem expor CI/CS no JavaScript do site.

## 1. DNS

Crie um registro A:

- Host: `api`
- Destino: IP público da VM Azure

O resultado deve ser `api.moritz.services` apontando para a VM.

## 2. Copiar a API para a VM

No Windows, dentro da pasta do repositório:

```powershell
scp -r .\payments-api azureuser@IP_DA_VM:/home/azureuser/moritz-payments
```

## 3. Instalar e testar

Na VM:

```bash
cd /home/azureuser/moritz-payments
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8787
```

Em outro terminal da VM:

```bash
curl http://127.0.0.1:8787/api/health
```

Esperado: `{"ok":true,"service":"Moritz Payments API"}`.

## 4. Rodar 24/7 com systemd

```bash
sudo cp /home/azureuser/moritz-payments/deploy/moritz-payments.service /etc/systemd/system/moritz-payments.service
sudo systemctl daemon-reload
sudo systemctl enable --now moritz-payments.service
sudo systemctl status moritz-payments.service
```

## 5. Nginx + HTTPS

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /home/azureuser/moritz-payments/deploy/nginx-api.moritz.services.conf /etc/nginx/sites-available/api.moritz.services
sudo ln -sf /etc/nginx/sites-available/api.moritz.services /etc/nginx/sites-enabled/api.moritz.services
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d api.moritz.services
```

Depois teste:

```bash
curl https://api.moritz.services/api/health
```

## 6. Atualizações futuras

Depois de trocar arquivos da API na VM:

```bash
sudo systemctl restart moritz-payments.service
sudo journalctl -u moritz-payments.service -n 100 --no-pager
```

## Como o saldo funciona

- O saldo é individual por Firebase UID e fica em `payments-api/data/payments.db`.
- Depósito: cria PIX na MisticPay e só credita após `/transactions/check` confirmar `COMPLETO`.
- Saque: reserva o saldo local antes de enviar à MisticPay; se a gateway indicar falha, o valor é devolvido automaticamente.
- O webhook não é usado como prova de pagamento. Ele apenas dispara uma nova consulta autenticada à MisticPay.
- O frontend envia o Firebase ID Token; a API verifica assinatura, projeto, expiração e e-mail antes de permitir operações.
