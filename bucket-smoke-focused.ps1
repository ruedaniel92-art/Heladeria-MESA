param()
$ErrorActionPreference = 'Stop'
$baseUrl = 'http://127.0.0.1:3000'
function Invoke-Api {
  param(
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    $Body = $null
  )
  $params = @{ Method = $Method; Uri = "$baseUrl$Path"; UseBasicParsing = $true; TimeoutSec = 15 }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }
  try {
    $response = Invoke-WebRequest @params
    $parsed = $null
    if ($response.Content) { try { $parsed = $response.Content | ConvertFrom-Json } catch { $parsed = $response.Content } }
    [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Body = $parsed; Raw = $response.Content }
  } catch {
    $statusCode = $null; $raw = $null; $parsed = $null
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd(); $reader.Close()
      if ($raw) { try { $parsed = $raw | ConvertFrom-Json } catch { $parsed = $raw } }
    }
    [pscustomobject]@{ StatusCode = $statusCode; Body = $parsed; Raw = $raw; Error = $_.Exception.Message }
  }
}
function Short-Raw($raw) {
  if ($null -eq $raw) { return $null }
  $s = [string]$raw
  if ($s.Length -le 400) { return $s }
  return $s.Substring(0,400)
}
$ts = Get-Date -Format 'yyyyMMddHHmmssfff'
$now = (Get-Date).ToString('o')
$rawName = "QA MP Balde $ts"
$flavorName = "QA Sabor $ts"
$sellName = "QA Helado $ts"
$step1 = Invoke-Api -Method 'POST' -Path '/productos' -Body @{ nombre = $rawName; tipo = 'materia prima'; stockMin = 0; medida = 'balde'; rendimientoPorCompra = 10 }
$rawProduct = $step1.Body.producto
$rawId = if ($rawProduct -and $rawProduct.id) { [string]$rawProduct.id } else { '' }
$step2 = Invoke-Api -Method 'POST' -Path '/sabores' -Body @{ nombre = $flavorName; materiaPrimaId = $rawId }
$flavor = $step2.Body.sabor
$flavorId = if ($flavor -and $flavor.id) { [string]$flavor.id } else { '' }
$step3 = Invoke-Api -Method 'POST' -Path '/productos' -Body @{ nombre = $sellName; precio = 50; tipo = 'productos'; stockMin = 0; modoControl = 'helado-sabores'; pelotasPorUnidad = 2 }
$sellProduct = $step3.Body.producto
$sellId = if ($sellProduct -and $sellProduct.id) { [string]$sellProduct.id } else { '' }
$step4 = Invoke-Api -Method 'POST' -Path '/compras' -Body @{ documento = "QA-COMP-$ts"; proveedor = 'QA Smoke'; fecha = $now; paymentType = 'contado'; paymentMethod = 'efectivo'; cashOut = 100; cashReceived = 100; items = @(@{ id = $rawId; cantidad = 1; costo = 100 }) }
$purchaseItem0 = if ($step4.Body -and $step4.Body.compra -and @($step4.Body.compra.items).Count -gt 0) { @($step4.Body.compra.items)[0] } else { $null }
$step5 = Invoke-Api -Method 'POST' -Path '/baldes-control/abrir' -Body @{ saborId = $flavorId; observacion = "QA open $ts" }
$bucket = $step5.Body.balde
$bucketId = if ($bucket -and $bucket.id) { [string]$bucket.id } else { '' }
$step6 = Invoke-Api -Method 'POST' -Path '/ventas' -Body @{ documento = "QA-VTA-$ts"; cliente = 'QA Smoke'; fecha = $now; paymentType = 'contado'; paymentMethod = 'efectivo'; cashReceived = 100; items = @(@{ id = $sellId; cantidad = 1; precio = 50; sabores = @(@{ id = $flavorId; porciones = 2 }) }) }
$saleItem0 = if ($step6.Body -and $step6.Body.venta -and @($step6.Body.venta.items).Count -gt 0) { @($step6.Body.venta.items)[0] } else { $null }
$saleFlavor0 = if ($saleItem0 -and @($saleItem0.sabores).Count -gt 0) { @($saleItem0.sabores)[0] } else { $null }
$step7a = Invoke-Api -Method 'GET' -Path '/baldes-control'
$bucketAfter = if ($bucketId) { @($step7a.Body | Where-Object { [string]$_.id -eq $bucketId }) | Select-Object -First 1 } else { $null }
$step7b = Invoke-Api -Method 'GET' -Path '/productos'
$rawAfter = if ($rawId) { @($step7b.Body | Where-Object { [string]$_.id -eq $rawId }) | Select-Object -First 1 } else { $null }
$sellAfter = if ($sellId) { @($step7b.Body | Where-Object { [string]$_.id -eq $sellId }) | Select-Object -First 1 } else { $null }
$allEarlierOk = @($step1,$step2,$step3,$step4,$step5,$step6,$step7a,$step7b) | Where-Object { -not ($_.StatusCode -ge 200 -and $_.StatusCode -lt 300) } | Measure-Object | Select-Object -ExpandProperty Count
if ($allEarlierOk -eq 0 -and $bucketId) {
  $step8 = Invoke-Api -Method 'POST' -Path "/baldes-control/$bucketId/cerrar" -Body @{ observacion = "QA close $ts" }
} else {
  $step8 = [pscustomobject]@{ StatusCode = 'SKIPPED'; Body = [pscustomobject]@{ reason = 'Skipped because one or more earlier steps failed.' }; Raw = $null }
}
$firstFailure = @(
  [pscustomobject]@{ step = '1'; resp = $step1 },
  [pscustomobject]@{ step = '2'; resp = $step2 },
  [pscustomobject]@{ step = '3'; resp = $step3 },
  [pscustomobject]@{ step = '4'; resp = $step4 },
  [pscustomobject]@{ step = '5'; resp = $step5 },
  [pscustomobject]@{ step = '6'; resp = $step6 },
  [pscustomobject]@{ step = '7a'; resp = $step7a },
  [pscustomobject]@{ step = '7b'; resp = $step7b }
) | Where-Object { $_.resp.StatusCode -is [int] -and $_.resp.StatusCode -ge 400 } | Select-Object -First 1
$firstFailureSummary = if ($null -ne $firstFailure) { [pscustomobject]@{ step = $firstFailure.step; status = $firstFailure.resp.StatusCode; body = $firstFailure.resp.Body; raw = (Short-Raw $firstFailure.resp.Raw) } } else { $null }
$result = [pscustomobject]@{
  timestamp = $ts
  names = [pscustomobject]@{ rawMaterial = $rawName; flavor = $flavorName; sellableProduct = $sellName }
  firstFailure = $firstFailureSummary
  steps = @(
    [pscustomobject]@{ step = '1) POST /productos raw material'; status = $step1.StatusCode; key = [pscustomobject]@{ message = $step1.Body.message; error = $step1.Body.error; id = $rawProduct.id; nombre = $rawProduct.nombre; tipo = $rawProduct.tipo; stock = $rawProduct.stock; rendimientoPorCompra = $rawProduct.rendimientoPorCompra }; raw = (Short-Raw $step1.Raw) },
    [pscustomobject]@{ step = '2) POST /sabores linked to raw material'; status = $step2.StatusCode; key = [pscustomobject]@{ message = $step2.Body.message; error = $step2.Body.error; id = $flavor.id; nombre = $flavor.nombre; materiaPrimaId = $flavor.materiaPrimaId; materiaPrimaNombre = $flavor.materiaPrimaNombre }; raw = (Short-Raw $step2.Raw) },
    [pscustomobject]@{ step = '3) POST /productos sellable helado-sabores product'; status = $step3.StatusCode; key = [pscustomobject]@{ message = $step3.Body.message; error = $step3.Body.error; id = $sellProduct.id; nombre = $sellProduct.nombre; tipo = $sellProduct.tipo; modoControl = $sellProduct.modoControl; pelotasPorUnidad = $sellProduct.pelotasPorUnidad; precio = $sellProduct.precio }; raw = (Short-Raw $step3.Raw) },
    [pscustomobject]@{ step = '4) POST /compras for raw material'; status = $step4.StatusCode; key = [pscustomobject]@{ message = $step4.Body.message; error = $step4.Body.error; documento = $step4.Body.compra.documento; proveedor = $step4.Body.compra.proveedor; itemCantidad = $purchaseItem0.cantidad; itemId = $purchaseItem0.id }; raw = (Short-Raw $step4.Raw) },
    [pscustomobject]@{ step = '5) POST /baldes-control/abrir'; status = $step5.StatusCode; key = [pscustomobject]@{ message = $step5.Body.message; error = $step5.Body.error; id = $bucket.id; saborId = $bucket.saborId; estado = $bucket.estado; porcionesVendidas = $bucket.porcionesVendidas; ventasAsociadas = $bucket.ventasAsociadas }; raw = (Short-Raw $step5.Raw) },
    [pscustomobject]@{ step = '6) POST /ventas using the flavor'; status = $step6.StatusCode; key = [pscustomobject]@{ message = $step6.Body.message; error = $step6.Body.error; documento = $step6.Body.venta.documento; cliente = $step6.Body.venta.cliente; totalItems = @($step6.Body.venta.items).Count; saborPorciones = $saleFlavor0.porciones; baldeControlId = $saleFlavor0.baldeControlId; cashChange = $step6.Body.venta.cashChange }; raw = (Short-Raw $step6.Raw) },
    [pscustomobject]@{ step = '7a) GET /baldes-control'; status = $step7a.StatusCode; key = [pscustomobject]@{ count = @($step7a.Body).Count; bucketId = $bucketAfter.id; estado = $bucketAfter.estado; porcionesVendidas = $bucketAfter.porcionesVendidas; ventasAsociadas = $bucketAfter.ventasAsociadas }; raw = (Short-Raw $step7a.Raw) },
    [pscustomobject]@{ step = '7b) GET /productos'; status = $step7b.StatusCode; key = [pscustomobject]@{ count = @($step7b.Body).Count; rawId = $rawAfter.id; rawStock = $rawAfter.stock; rawTipo = $rawAfter.tipo; sellId = $sellAfter.id; sellStock = $sellAfter.stock; sellModoControl = $sellAfter.modoControl }; raw = (Short-Raw $step7b.Raw) },
    [pscustomobject]@{ step = '8) POST /baldes-control/:id/cerrar'; status = $step8.StatusCode; key = if ($step8.StatusCode -eq 'SKIPPED') { $step8.Body } else { [pscustomobject]@{ message = $step8.Body.message; error = $step8.Body.error; id = $step8.Body.balde.id; estado = $step8.Body.balde.estado; fechaCierre = $step8.Body.balde.fechaCierre; porcionesVendidas = $step8.Body.balde.porcionesVendidas; ventasAsociadas = $step8.Body.balde.ventasAsociadas } }; raw = (Short-Raw $step8.Raw) }
  )
}
Write-Output ($result | ConvertTo-Json -Depth 20)

