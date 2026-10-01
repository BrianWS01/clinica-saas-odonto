#!/bin/sh
# Build da Vercel: copia os arquivos do site para public/ e gera js/config.js
# a partir das variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY
# (cadastradas em Vercel > Project > Settings > Environment Variables).
set -e

: "${SUPABASE_URL:?Defina SUPABASE_URL nas Environment Variables da Vercel}"
: "${SUPABASE_ANON_KEY:?Defina SUPABASE_ANON_KEY nas Environment Variables da Vercel}"

# Limpa o que costuma vir junto ao colar: espaços, quebras de linha, aspas,
# "/rest/v1" e barra no final da URL.
URL=$(printf '%s' "$SUPABASE_URL" | tr -d " \t\r\n\"'" | sed -e 's#/rest/v1/*$##' -e 's#/*$##')
CHAVE=$(printf '%s' "$SUPABASE_ANON_KEY" | tr -d " \t\r\n\"'")

case "$URL" in
  https://*.supabase.co) ;;
  *)
    echo "SUPABASE_URL inválida: '$URL'"
    echo "Use a Project URL, no formato https://SEU-PROJETO.supabase.co"
    exit 1
    ;;
esac

case "$CHAVE" in
  sb_secret_*)
    echo "SUPABASE_ANON_KEY é uma chave SECRETA. Use a publishable (sb_publishable_...) ou a anon (eyJ...)."
    exit 1
    ;;
  sb_publishable_*|eyJ*) ;;
  *)
    echo "SUPABASE_ANON_KEY não parece uma chave do Supabase (deve começar com sb_publishable_ ou eyJ)."
    exit 1
    ;;
esac

rm -rf public
mkdir public
cp -r index.html app.html css js site public/
rm -f public/js/config.js

printf "export const SUPABASE_URL = '%s';\nexport const SUPABASE_ANON_KEY = '%s';\n" \
  "$URL" "$CHAVE" > public/js/config.js

echo "Build ok: public/ gerado com js/config.js"
echo "  SUPABASE_URL      = $URL"
echo "  SUPABASE_ANON_KEY = $(printf '%s' "$CHAVE" | cut -c1-16)... (${#CHAVE} caracteres)"
