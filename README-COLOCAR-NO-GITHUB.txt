MORITZ — VERSÃO PRONTA PARA GITHUB PAGES

1. Envie TODOS os arquivos desta pasta para a RAIZ da branch main.
   O arquivo index.html precisa aparecer junto do README na tela inicial do repositório.

2. Em Settings > Pages:
   Source: Deploy from a branch
   Branch: main
   Pasta: /(root)

3. O arquivo CNAME deve conter somente:
   moritz.services

4. No Firebase:
   - Authentication > Sign-in method > habilitar E-mail/senha
   - Firestore Database > criar o banco
   - Firestore > Rules > colar o conteúdo de firestore.rules e publicar
   - Authentication > Settings > Authorized domains > confirmar moritz.services

5. DNS no GoDaddy para GitHub Pages:
   A @ 185.199.108.153
   A @ 185.199.109.153
   A @ 185.199.110.153
   A @ 185.199.111.153
   CNAME www fiapoq-wq.github.io

   Remova outros registros A/AAAA/ALIAS/ANAME de @ e CNAME de www que apontem para
   GoDaddy, Website Builder, estacionamento de domínio ou outro serviço.

6. Após a propagação, volte em Settings > Pages e marque Enforce HTTPS.
