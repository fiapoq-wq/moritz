# Private client interface

- `leticiank@moritz.services` agora é detectado diretamente pelo e-mail autenticado.
- O painel privado não depende mais de `role`, `status` ou `interface` do Firestore para essa conta.
- A conta da Leticia não aparece na fila comum de Access Requests do administrador.
- Removida a tentativa de provisionamento por Secret Manager/Cloud Function.
- Demais usuários continuam usando o fluxo original.
