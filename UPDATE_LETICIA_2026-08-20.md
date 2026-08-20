# Atualização do painel privado da Leticia

## Interface
- Dashboard limpo e sem textos de "próxima etapa".
- Status de atualização contínua.
- Bot renomeado para `Moritz - VENDAS`.
- Imagem do bot carregada de `/moritz.png` na raiz do repositório.
- Função do perfil: `SELLER DIAMOND w- MORITZ`.
- Nova categoria `MARKET TOOLS` com `Advanced Search` e `API Console`.
- Ambas as ferramentas abrem uma tela de manutenção ZT Accounts com retorno em 22/08/2026 às 15:00.
- Nova tela de configuração do bot com informações, token de demonstração, botão mostrar/ocultar e ação `Abrir source` simulando carregamento/erro e retornando para a home.

## Faturas
- Aviso de 2 faturas vencidas ao entrar na conta.
- Botões para remover o aviso e abrir as faturas.
- MARKET API:
  - Trimestral: R$ 149,99
  - Semestre + bônus de vendas: R$ 249,99
  - Anual: R$ 349,99
- API PHOTOS ACCOUNTS:
  - Mensal: R$ 49,99
  - Semestre: R$ 199,99
- `Pagar todas agora` abre a escolha de planos antes da confirmação.
- O backend gera um PIX separado para o pagamento das faturas via MisticPay e acompanha o status.
- Após confirmação da gateway, as duas assinaturas passam para status ativo.

## Arquivos alterados
- `nakahara/sellerapi/index.html`
- `nakahara/sellerapi/assets.css`
- `nakahara/sellerapi/app.7f3d9c.js`
- `payments-api/app.py`

## Observação da imagem do bot
O frontend espera o arquivo na raiz do Git:

`/moritz.png`

A URL usada pela página é `../../moritz.png`.

## Publicação
Frontend: extrair este ZIP por cima de `C:\Moritz\moritz-git`, fazer commit e push.

Backend: depois do push, enviar apenas o `payments-api/app.py` atualizado para a VM e reiniciar `moritz-payments`.
