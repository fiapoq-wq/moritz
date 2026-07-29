# Moritz Admin — entrega inicial

Projeto pronto para Firebase Hosting, sem depender de React, Vite ou `npm install`.

## O que já funciona

- login com e-mail e senha;
- recuperação de senha;
- criação de conta;
- toda conta nova recebe `status: pending`;
- tela de cadastro em análise;
- aprovação manual pelo Firestore;
- tela de acesso negado;
- painel protegido com página “Painel em atualização”;
- layout preto com verde escuro, responsivo;
- regras que impedem o usuário de aprovar a própria conta.

## 1. Configurar o Firebase

1. No Firebase Console, abra ou crie o projeto.
2. Vá em **Authentication > Sign-in method** e habilite **E-mail/senha**.
3. Vá em **Firestore Database** e crie o banco.
4. Vá em **Configurações do projeto > Seus apps > Web**.
5. Copie o conteúdo do objeto `firebaseConfig`.
6. Abra `public/firebase-config.js` e substitua os valores de exemplo.

O `firebaseConfig` do site não é uma chave administrativa. Nunca coloque token do bot do Discord, chave de serviço ou segredo de API no frontend.

## 2. Publicar

Instale a CLI, caso ainda não tenha:

```bash
npm install -g firebase-tools
firebase login
```

Dentro desta pasta:

```bash
firebase use --add
firebase deploy --only hosting,firestore:rules
```

## 3. Aprovar a conta da cliente

1. Peça para ela criar a conta pelo site.
2. Abra **Firestore Database > users**.
3. Abra o documento da conta.
4. Edite `status` de `pending` para `approved`.
5. Ela pode clicar em **Atualizar status** ou entrar novamente.

Para recusar, use `rejected`.

## 4. Domínio moritz.services

O GitHub fica como repositório. A hospedagem passa a ser o Firebase Hosting.

No Firebase Console:

1. Vá em **Hosting > Add custom domain**.
2. Informe `moritz.services`.
3. Copie os registros DNS exibidos pelo Firebase.
4. No provedor do domínio, remova os registros A/CNAME do GitHub Pages que conflitam e coloque os registros informados pelo Firebase.

## GitHub automático depois

Depois que publicar manualmente uma vez, você pode ativar deploy automático:

```bash
firebase init hosting:github
```

Selecione o repositório `fiapoq-wq/moritz`.

## Sobre o código-fonte

O navegador sempre recebe HTML, CSS e JavaScript, então não existe bloqueio absoluto de `Ctrl+U` ou DevTools. A proteção real está nas regras do Firestore e em manter segredos fora do frontend. Os arquivos publicados usam nomes genéricos e não contêm token do bot.
