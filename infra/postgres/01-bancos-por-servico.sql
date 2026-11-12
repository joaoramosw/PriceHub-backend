-- Um banco por microsserviço (database per service).
-- Os serviços não leem o banco uns dos outros: só se comunicam por eventos.
CREATE DATABASE ingestao;
CREATE DATABASE catalogo;
CREATE DATABASE auditoria;
