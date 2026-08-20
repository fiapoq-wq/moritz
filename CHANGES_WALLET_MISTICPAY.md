# Saldo + MisticPay

Adicionado à interface privada da Leticia:

- saldo no canto superior direito;
- carteira dentro de Meu Perfil;
- depósito PIX com QR Code e copia-e-cola;
- saque PIX por CPF, CNPJ, e-mail, telefone ou chave aleatória;
- histórico de movimentações;
- atualização automática de depósitos/saques pendentes;
- backend FastAPI para rodar na VM Azure;
- autenticação do backend usando o Firebase ID Token do login atual;
- saldo individual por Firebase UID em SQLite;
- webhook que reconfirma a transação na MisticPay antes de alterar o saldo.

A API do frontend está configurada para `https://api.moritz.services`.
