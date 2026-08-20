PATCH: melhora visual da aba de faturas + reabrir PIX pendente + limpar histórico

Arquivos alterados:
- nakahara/sellerapi/index.html
- nakahara/sellerapi/assets.css
- nakahara/sellerapi/app.7f3d9c.js
- payments-api/app.py

O que muda:
1. Modal de faturas redesenhado com cards de planos e resumo do total.
2. Se já existir PIX pendente, o painel reabre esse PIX em vez de travar.
3. Botão extra para gerar novo PIX novamente.
4. Botão invisível para excluir o histórico na área de movimentações.
5. Endpoint novo no backend para limpar histórico.

Deploy rápido:
WINDOWS/GIT
1) Extraia o ZIP na raiz do projeto C:\Moritz\moritz-git.
2) Faça commit/push do frontend normalmente.
3) Envie payments-api/app.py para a VM.

AZURE/VM
cd /home/azureuser/moritz-payments
.venv/bin/python -m py_compile app.py
sudo systemctl restart moritz-payments
sudo systemctl status moritz-payments --no-pager
curl https://api.moritz.services/api/health
