# 6️⃣ Passo 6 · Uma identidade para o app: Service Principal + grants

Um app que roda **fora do Databricks** (no servidor, em Docker) não deve usar senha de pessoa nem token pessoal.
Ele ganha uma **identidade própria no workspace — um Service Principal (SP)** — e se autentica com **OAuth M2M**
(client id + secret). Com isso, o backend pede ao Databricks um **token do Lakebase (válido por 1 h)** e o usa como senha do Postgres.

```
app (Docker) ──client id + secret──► Databricks OAuth ──token do Lakebase (1h)──► Postgres (role = client id do SP)
```

⏱️ 10 min · **6a** na UI do workspace · **6b** no notebook [`06_grants_service_principal`](./06_grants_service_principal.py) (ou no SQL Editor do Lakebase)

---

## 6a · Criar o Service Principal e o secret OAuth

**Pela UI** (precisa ser admin do workspace):
1. Canto superior direito › **Settings** › **Identity and access** › **Service principals** › **Manage** › **Add service principal**.
2. **Add new** › nome **`energia-app-sp`** › **Add**.
3. Abra o SP › aba **Secrets** › **Generate secret** (vida útil padrão: 730 dias).
4. Copie os dois valores — **o secret aparece uma única vez**:
   - **Client ID** (= *Application ID*, um UUID) → `DATABRICKS_CLIENT_ID`
   - **Secret** → `DATABRICKS_CLIENT_SECRET`

<details><summary>Alternativa pelo CLI</summary>

```bash
databricks service-principals create --display-name energia-app-sp -p <perfil> -o json   # anote "id" e "applicationId"
databricks service-principal-secrets-proxy create <id> -p <perfil> -o json               # anote "secret"
```
</details>

> 🔐 Guarde o secret num cofre (Azure Key Vault, Vault, secret do Docker/Kubernetes). No workshop ele vai para o `app/.env` (fora do git).

---

## 6b · Grants: o que o Service Principal pode fazer

São **três camadas** — todas no notebook [`06_grants_service_principal`](./06_grants_service_principal.py) (widget `sp_client_id`):

| # | Camada | Grant | Por quê |
|---|---|---|---|
| 1 | **Databricks** (projeto Lakebase) | `CAN_USE` no projeto `energia-workshop` | permite ao SP **gerar o token** do Lakebase (OAuth) |
| 2 | **Postgres** (identidade) | role OAuth do SP no branch `production` | o SP passa a existir como usuário Postgres (nome = client id) |
| 3 | **Postgres** (privilégios) | `GRANT energia_app TO "<client-id>"` | herda os privilégios da role de aplicação: escreve em `operacao`, lê `analitico` |

O SQL equivalente (camadas 2 e 3) — cole no **SQL Editor** do Lakebase, database `energia`:
```sql
SELECT databricks_create_role('<client-id>', 'service_principal');   -- role OAuth do SP
GRANT energia_app TO "<client-id>";                                  -- privilégios do app (role de grupo)
```
Camada 1 pela UI: projeto Lakebase › **Permissions** › adicionar `energia-app-sp` com **Can use**. Pelo CLI:
```bash
databricks permissions update database-projects energia-workshop -p <perfil> \
  --json '{"access_control_list":[{"service_principal_name":"<client-id>","permission_level":"CAN_USE"}]}'
```

> 💡 **Por que uma role de grupo (`energia_app`)?** Os privilégios ficam num lugar só. Trocar o SP, adicionar um segundo app
> ou um usuário de suporte é um `GRANT energia_app TO ...` — sem repetir `GRANT` tabela por tabela.
>
> 💡 **Unity Catalog:** o app conversa **direto com o Postgres** — o SP não precisa de grants no UC. Quem consulta o catálogo
> `energia_lakebase` (Passo 3) é governado pelo UC normalmente.

### (Opcional) Senha nativa para a role `app_energia`
Para o momento *"vocês só trocam a connection string"* do Passo 7 — no SQL Editor do Lakebase:
```sql
ALTER ROLE app_energia WITH LOGIN PASSWORD '<senha-forte-com-12+-caracteres>';
```

✅ **Checkpoint:** a última célula do notebook mostra o SP com `CAN_USE`, role `LAKEBASE_OAUTH_V1` e ✅ em `INSERT` (operacao) e `SELECT` (analitico).
Próximo: [**Passo 7 — build e execução do app local**](../07_App_Local/README.md).

> ⚡ Atalho (opcional): [`scripts/criar_service_principal.sh`](../scripts/criar_service_principal.sh) faz 6a + 6b e escreve o `app/.env` de uma vez.
