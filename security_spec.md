# Especificação de Segurança Firestore - Sistema de Controle de Orçamento

## 1. Invariantes de Dados (Data Invariants)
- Documentos de `contratos` devem conter um ID válido (`isValidId(contratoId)`), número e razão social válidos.
- Nenhuma operação pode injetar chaves não estruturadas ou campos abusivos que excedam limites de tamanho.
- Coleções `contratos` e `configuracoes` só permitem gravação de dados válidos.
- Leituras globais são permitidas para usuários autorizados da aplicação.
- Atualizações e exclusões em `contratos` devem referenciar documentos existentes e válidos.

## 2. The "Dirty Dozen" Payloads (Ataques e Casos Inválidos Rejeitados)
1. **Document ID Injection**: ID de contrato com mais de 128 caracteres ou caracteres especiais (ex: `../../admin`).
2. **Missing Required Fields**: Criação de contrato sem campo `numero` ou `razaoSocial`.
3. **Invalid Data Type**: Injeção de `valorContratado` como string ou booleano em vez de number.
4. **Oversized String Payload**: Campo `objeto` ou `descricao` com mais de 50.000 caracteres para esgotar cota.
5. **Unauthorized Collection Access**: Tentativa de escrita em coleções não mapeadas (ex: `/system_secrets/keys`).
6. **Malicious Schema Contamination**: Gravação de campos fantasmas como `isAdmin: true` ou `execScript: ...`.
7. **Negative Values or Infinity**: Gravação de `valorContratado: NaN` ou tipos incompatíveis.
8. **Invalid Regex Pattern**: ID de contrato com pontuação não permitida.
9. **Arbitrary Write in Subcollections**: Gravação em subcoleções inexistentes sem validação de regras.
10. **Config Tampering**: Gravação de `configuracoes` com ID malformado ou payload inválido.
11. **Batch Corruption Attack**: Tentativa de gravação que omite `id` fundamental do contrato.
12. **Denial of Wallet Attack**: Requisição em lote com 10.000 campos não declarados.

## 3. Validação e Cobertura
Todas as operações de criação, atualização e exclusão passam pelas funções de validação `isValidId()`, `isValidContrato()` e `isValidConfiguracao()`.
