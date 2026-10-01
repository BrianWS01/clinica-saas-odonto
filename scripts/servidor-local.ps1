# Servidor estático para testar no Windows sem Node/Python:
#   powershell -ExecutionPolicy Bypass -File scripts/servidor-local.ps1 [-Porta 5500]
param([int]$Porta = 5500)
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'; '.webp' = 'image/webp'
}
$ouvinte = [System.Net.HttpListener]::new()
$ouvinte.Prefixes.Add("http://localhost:$Porta/")
$ouvinte.Start()
Write-Host "Servindo $raiz em http://localhost:$Porta/"
while ($ouvinte.IsListening) {
  $ctx = $ouvinte.GetContext()
  $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if ($caminho -eq '' -or $caminho.EndsWith('/')) { $caminho += 'index.html' }
  $arquivo = [IO.Path]::GetFullPath((Join-Path $raiz $caminho))
  if ($arquivo.StartsWith($raiz) -and (Test-Path $arquivo -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($arquivo)
    $ext = [IO.Path]::GetExtension($arquivo).ToLower()
    $ctx.Response.ContentType = if ($tipos[$ext]) { $tipos[$ext] } else { 'application/octet-stream' }
    $ctx.Response.Headers.Add('Cache-Control', 'no-store')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
  Write-Host "$($ctx.Response.StatusCode) /$caminho"
}
