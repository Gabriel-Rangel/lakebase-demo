# 6️⃣ Passo 6 (f + e′) · Uma identidade para o app: Service Principal + grants — pela UI

Um app que roda **fora do Databricks** (no servidor, em Docker) não deve usar senha de pessoa nem token pessoal.
Ele ganha uma **identidade própria no workspace — um Service Principal (SP)** — e se autentica com **OAuth M2M** (client id + secret).
O backend pede ao Databricks um **token do Lakebase (válido por 1 h)** e o usa como senha do Postgres.

```
app (Docker) ──client id + secret──► Databricks OAuth ──token do Lakebase (1 h)──► Postgres (role = client id do SP)
```

⏱️ 10 min

---

## 6a · (f) Criar o Service Principal e o secret OAuth
Precisa ser admin do workspace.
1. Canto superior direito › **Settings** › **Identity and access** › **Service principals** › **Manage** › **Add service principal**.
2. **Add new** › nome **`energia-app-sp`** › **Add**.
3. Abra o SP › aba **Secrets** › **Generate secret**.
4. Copie os dois valores. **O secret aparece uma única vez.**
   - **Client ID** (= *Application ID*, um UUID) → `DATABRICKS_CLIENT_ID` no Passo 7
   - **Secret** → `DATABRICKS_CLIENT_SECRET` no Passo 7

> 🔐 Em produção, o secret vai para um cofre (Azure Key Vault, Vault, secret do Docker/Kubernetes). No workshop ele vai para o `app/.env`, que fica fora do git.

## 6b · (e′) Grants: o que o Service Principal pode fazer
São **três camadas**:

| # | Camada | Onde (UI) | Por quê |
|---|---|---|---|
| 1 | **Databricks**: `CAN USE` no projeto | Lakebase › projeto › **Settings** › **Project permissions** › **Grant permission** › `energia-app-sp` › **CAN USE** | permite ao SP **gerar o token** do Lakebase |
| 2 | **Postgres**: role OAuth do SP | branch `production` › **Roles & Databases** › **Add role** › aba **OAuth** › selecione `energia-app-sp` | o SP passa a existir como usuário Postgres (nome = client id) |
| 3 | **Postgres**: privilégios | **SQL Editor** (database `energia`) › [`6b_grants_postgres.sql`](./6b_grants_postgres.sql), trocando o client id | o SP vira membro de `energia_app`: escreve em `operacao` e lê as synced tables |

> Alternativa em SQL para a camada 2 (SQL Editor): `SELECT databricks_create_role('<client-id>', 'service_principal');`

> 💡 **Por que uma role de grupo (`energia_app`)?** Os privilégios ficam num lugar só. Trocar o SP, adicionar um segundo app ou um
> usuário de suporte é um `GRANT energia_app TO …`, sem repetir `GRANT` tabela por tabela.
>
> 💡 **Unity Catalog:** o app conversa **direto com o Postgres**, então o SP não precisa de grants no UC.

### (Opcional) Role com senha nativa, para o momento *"só troque a connection string"* (Passo 7.5)
1. Branch `production` › **Roles & Databases** › **Add role** › aba **Password** › **Role name** `app_energia` › **Create**.
   Copie a **senha gerada**: ela aparece uma vez.
2. SQL Editor (database `energia`): `GRANT energia_app TO app_energia;`

---

✅ **Checkpoint:** a consulta final do `6b_grants_postgres.sql` mostra o client id do SP como membro de `energia_app`, com ✅ em
`insere_os` e `le_saude`.
💬 *"O app não tem senha de banco: tem uma identidade do workspace, governada e auditável."*

Próximo: [**Passo 7 — build e execução do app local**](../07_App_Local/README.md)
