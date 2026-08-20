# Conta privada da Leticia

A interface privada é selecionada automaticamente pelo e-mail autenticado no Firebase:

- `leticiank@moritz.services` → painel privado (Dashboard, My Bots e Meu Perfil)
- demais contas → fluxo normal existente do painel

Não é necessário criar `role: client`, `interface: client`, Secret Manager ou Cloud Function para selecionar essa interface.

A conta pode existir normalmente no Firebase Authentication. Se ela também tiver um documento em `users/{uid}` criado pelo cadastro normal, os dados de nome, Discord e avatar são reaproveitados, mas o painel privado continua sendo forçado para esse e-mail.
