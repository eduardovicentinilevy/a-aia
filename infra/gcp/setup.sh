#!/usr/bin/env bash
# One-time Google Cloud setup for AçaIA (Phase 1 deploy). Safe to run again.
#
# Run it in Cloud Shell (console.cloud.google.com → icon ">_" at the top):
#   bash setup.sh <PROJECT_ID>
#
# It creates (all inside the free tiers at our scale — see docs/GCP_SETUP.md):
#   - Artifact Registry repository "acaia" (Docker images), keeping only recent images
#   - service accounts: acaia-api (runs the API) and acaia-deployer (used by GitHub Actions)
#   - secrets: acaia-database-url (Neon) and acaia-pro-api-key (Gemini) — typed hidden, never echoed
#   - Workload Identity Federation: only workflows of THIS repository on main can deploy
set -euo pipefail

PROJECT_ID="${1:?Uso: bash setup.sh <PROJECT_ID>}"
REGION="${REGION:-southamerica-east1}"
GITHUB_REPO="${GITHUB_REPO:-eduardovicentinilevy/a-aia}"
API_SA="acaia-api@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOY_SA="acaia-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

step "1/6 Ativando as APIs necessárias"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com \
  firebasehosting.googleapis.com

step "2/6 Repositório de imagens (Artifact Registry)"
if ! gcloud artifacts repositories describe acaia --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create acaia --repository-format docker --location "$REGION" \
    --description "Imagens da API da AçaIA"
fi
# Keep the 5 most recent images and delete the rest after 7 days (stays inside the 0.5 GB free tier).
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<'EOF'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 5 } },
  { "name": "delete-old", "action": { "type": "Delete" }, "condition": { "olderThan": "604800s" } }
]
EOF
gcloud artifacts repositories set-cleanup-policies acaia --location "$REGION" --policy "$POLICY_FILE" --no-dry-run >/dev/null
rm -f "$POLICY_FILE"

step "3/6 Contas de serviço"
create_sa() {
  if ! gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$1" --display-name "$2"
  fi
}
create_sa acaia-api "AçaIA API (Cloud Run)"
create_sa acaia-deployer "AçaIA deploy (GitHub Actions)"

step "4/6 Segredos (o que você digitar não aparece na tela nem no histórico)"
create_secret() {
  local name="$1" prompt="$2" value
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    read -r -p "O segredo $name já existe. Trocar o valor? [s/N] " answer
    [[ "$answer" =~ ^[sS]$ ]] || return 0
    read -r -s -p "$prompt: " value; echo
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    read -r -s -p "$prompt: " value; echo
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy automatic --data-file=- >/dev/null
  fi
}
create_secret acaia-database-url "Connection string DIRETA do Neon (postgresql://..., sem '-pooler')"
create_secret acaia-pro-api-key "Chave do Gemini (PRO_API_KEY)"

grant_secret() {
  gcloud secrets add-iam-policy-binding "$1" --member "serviceAccount:$2" \
    --role roles/secretmanager.secretAccessor --condition=None >/dev/null
}
grant_secret acaia-database-url "$API_SA"
grant_secret acaia-pro-api-key "$API_SA"
grant_secret acaia-database-url "$DEPLOY_SA" # the deploy runs the migrations

step "5/6 Permissões mínimas do deploy"
for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" \
    --role "$role" --condition=None >/dev/null
done
# The deployer may start Cloud Run revisions that run as acaia-api (and nothing else).
gcloud iam service-accounts add-iam-policy-binding "$API_SA" --member "serviceAccount:$DEPLOY_SA" \
  --role roles/iam.serviceAccountUser >/dev/null

step "6/6 Workload Identity Federation (GitHub → Google, sem chave JSON)"
if ! gcloud iam workload-identity-pools describe github --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create github --location global --display-name "GitHub Actions"
fi
if ! gcloud iam workload-identity-pools providers describe github-oidc --location global \
  --workload-identity-pool github >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc github-oidc \
    --location global \
    --workload-identity-pool github \
    --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository == '${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'"
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}" \
  >/dev/null

PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/providers/github-oidc"

cat <<EOF

$(printf '\033[1;32m')Pronto!$(printf '\033[0m') Agora, no GitHub: Settings → Secrets and variables → Actions → aba "Variables":

  GCP_PROJECT_ID     = ${PROJECT_ID}
  GCP_WIF_PROVIDER   = ${PROVIDER}
  GCP_DEPLOY_SA      = ${DEPLOY_SA}

E as outras da lista em docs/GCP_SETUP.md (Firebase, PRO_MODEL...). Nada disso é segredo.
EOF
