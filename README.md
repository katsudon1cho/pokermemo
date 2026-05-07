# Poker Memo

カジノのポーカールームで同卓者を素早く記録するPWAです。

要件定義は [REQUIREMENTS.md](./REQUIREMENTS.md) を参照してください。

## 起動

```sh
python3 -m http.server 4173
```

ブラウザで `http://localhost:4173` を開きます。

## Supabase設定

### CLIで反映する場合

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy delete-account
```

### SQL Editorで反映する場合

`supabase/schema.sql` をSupabase SQL Editorで実行します。

### アプリ接続

1. `config.js` にProject URLとPublishable Keyを設定します。
2. Supabase AuthでGoogle/Apple/Email providerを有効化します。
3. AuthのSite URLにアプリのURLを設定します。ローカルでは `http://localhost:4173` です。

`config.js` はローカル用です。公開環境ではビルド時またはホスティング側の仕組みで値を注入してください。
