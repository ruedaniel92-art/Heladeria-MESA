param()
$ErrorActionPreference = 'Stop'
$baseUrl = 'http://127.0.0.1:3000'

function Invoke-Api {
  param(
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    $Body = $null
  )

  $params = @{
    Method = $Method
    Uri = "$baseUrl$Path"
    UseBasicParsing = $true
    TimeoutSec = 10
  }

  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }

  try {
    $response = Invoke-WebRequest @params
    $parsed = $null
    if ($response.Content) {
      try { $parsed = $response.Content | ConvertFrom-Json -Depth 20 } catch { $parsed = $response.Content }
    }
    [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Body = $parsed
      Raw = $response.Content
    }
  } catch {
    $statusCode = $null
    $raw = $null
    $parsed = $null
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
      $reader.Close()
      if ($raw) {
        try { $parsed = $raw | ConvertFrom-Json -Depth 20 } catch { $parsed = $raw }
      }
    }
    [pscustomobject]@{
      StatusCode = $statusCode
      Body = $parsed
      Raw = $raw
      Error = $_.Exception.Message
    }
  }
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$now = (Get-Date).ToString('o')
$rawName = "QA MP Balde Vainilla $suffix"
$flavorName = "QA Sabor Vainilla $suffix"
$sellName = "QA Helado Vainilla 2P $suffix"
$yieldPerPurchase = 10
$purchaseQty = 1
$soldPortions = 2
$unitPrice = 50
$expectedStockAfterPurchase = $yieldPerPurchase * $purchaseQty
$expectedStockAfterSale = $expectedStockAfterPurchase - $soldPortions

$step1 = Invoke-Api -Method 'POST' -Path '/productos' -Body @{
  nombre = $rawName
  tipo = 'materia prima'
  stockMin = 0
  medida = 'balde'
  rendimientoPorCompra = $yieldPerPurchase
}
if ($step1.StatusCode -ne 201) { throw "Step1 failed: $($step1.Raw)" }
$rawProduct = $step1.Body.producto

$step2 = Invoke-Api -Method 'POST' -Path '/sabores' -Body @{
  nombre = $flavorName
  materiaPrimaId = $rawProduct.id
}
if ($step2.StatusCode -ne 201) { throw "Step2 failed: $($step2.Raw)" }
$flavor = $step2.Body.sabor

$step3 = Invoke-Api -Method 'POST' -Path '/productos' -Body @{
  nombre = $sellName
  precio = $unitPrice
  tipo = 'productos'
  stockMin = 0
  modoControl = 'helado-sabores'
  pelotasPorUnidad = 2
}
if ($step3.StatusCode -ne 201) { throw "Step3 failed: $($step3.Raw)" }
$sellProduct = $step3.Body.producto

$step4 = Invoke-Api -Method 'POST' -Path '/compras' -Body @{
  documento = "QA-COMP-$suffix"
  proveedor = 'QA Smoke'
  fecha = $now
  paymentType = 'contado'
  paymentMethod = 'efectivo'
  cashOut = 100
  items = @(
    @{
      id = $rawProduct.id
      cantidad = $purchaseQty
      costo = 100
    }
  )
}
if ($step4.StatusCode -ne 201) { throw "Step4 failed: $($step4.Raw)" }

$step5 = Invoke-Api -Method 'POST' -Path '/baldes-control/abrir' -Body @{
  saborId = $flavor.id
  observacion = 'QA smoke test open'
}
if ($step5.StatusCode -ne 201) { throw "Step5 failed: $($step5.Raw)" }
$bucket = $step5.Body.balde

$step6 = Invoke-Api -Method 'POST' -Path '/ventas' -Body @{
  cliente = 'QA Smoke'
  fecha = $now
  paymentType = 'contado'
  paymentMethod = 'efectivo'
  cashReceived = 100
  items = @(
    @{
      id = $sellProduct.id
      cantidad = 1
      precio = $unitPrice
      sabores = @(
        @{
          id = $flavor.id
          porciones = $soldPortions
        }
      )
    }
  )
}
if ($step6.StatusCode -ne 201) { throw "Step6 failed: $($step6.Raw)" }

$controlsAfterSale = Invoke-Api -Method 'GET' -Path '/baldes-control'
$productsAfterSale = Invoke-Api -Method 'GET' -Path '/productos'
if ($controlsAfterSale.StatusCode -ne 200) { throw "Step7 controls fetch failed: $($controlsAfterSale.Raw)" }
if ($productsAfterSale.StatusCode -ne 200) { throw "Step7 products fetch failed: $($productsAfterSale.Raw)" }
$bucketAfterSale = @($controlsAfterSale.Body | Where-Object { [string]$_.id -eq [string]$bucket.id })[0]
$rawAfterSale = @($productsAfterSale.Body | Where-Object { [string]$_.id -eq [string]$rawProduct.id })[0]

$step8Close = Invoke-Api -Method 'POST' -Path "/baldes-control/$($bucket.id)/cerrar" -Body @{
  observacion = 'QA smoke test close'
}
if ($step8Close.StatusCode -ne 200) { throw "Step8 close failed: $($step8Close.Raw)" }
$controlsAfterClose = Invoke-Api -Method 'GET' -Path '/baldes-control'
if ($controlsAfterClose.StatusCode -ne 200) { throw "Step8 controls fetch failed: $($controlsAfterClose.Raw)" }
$bucketAfterClose = @($controlsAfterClose.Body | Where-Object { [string]$_.id -eq [string]$bucket.id })[0]

$result = [pscustomobject]@{
  names = [pscustomobject]@{
    rawMaterial = $rawName
    flavor = $flavorName
    sellableProduct = $sellName
  }
  step1_createRawMaterial = [pscustomobject]@{
    status = $step1.StatusCode
    id = $rawProduct.id
    nombre = $rawProduct.nombre
    tipo = $rawProduct.tipo
    rendimientoPorCompra = $rawProduct.rendimientoPorCompra
    stock = $rawProduct.stock
  }
  step2_createFlavor = [pscustomobject]@{
    status = $step2.StatusCode
    id = $flavor.id
    nombre = $flavor.nombre
    materiaPrimaId = $flavor.materiaPrimaId
    materiaPrimaNombre = $flavor.materiaPrimaNombre
  }
  step3_createSellableProduct = [pscustomobject]@{
    status = $step3.StatusCode
    id = $sellProduct.id
    nombre = $sellProduct.nombre
    tipo = $sellProduct.tipo
    modoControl = $sellProduct.modoControl
    pelotasPorUnidad = $sellProduct.pelotasPorUnidad
  }
  step4_purchase = [pscustomobject]@{
    status = $step4.StatusCode
    documento = $step4.Body.compra.documento
    proveedor = $step4.Body.compra.proveedor
    itemCantidad = $step4.Body.compra.items[0].cantidad
    stockEsperadoPostCompra = $expectedStockAfterPurchase
  }
  step5_openBucket = [pscustomobject]@{
    status = $step5.StatusCode
    id = $bucket.id
    saborId = $bucket.saborId
    estado = $bucket.estado
    porcionesVendidas = $bucket.porcionesVendidas
    ventasAsociadas = $bucket.ventasAsociadas
  }
  step6_sale = [pscustomobject]@{
    status = $step6.StatusCode
    documento = $step6.Body.venta.documento
    cliente = $step6.Body.venta.cliente
    totalItems = @($step6.Body.venta.items).Count
    saborPorciones = $step6.Body.venta.items[0].sabores[0].porciones
    baldeControlId = $step6.Body.venta.items[0].sabores[0].baldeControlId
    cashChange = $step6.Body.venta.cashChange
  }
  step7_verifyAfterSale = [pscustomobject]@{
    bucketId = $bucketAfterSale.id
    estado = $bucketAfterSale.estado
    porcionesVendidas = $bucketAfterSale.porcionesVendidas
    ventasAsociadas = $bucketAfterSale.ventasAsociadas
    rawMaterialStock = $rawAfterSale.stock
    expectedRawMaterialStock = $expectedStockAfterSale
    porcionesMatch = ([int]$bucketAfterSale.porcionesVendidas -eq $soldPortions)
    ventasMatch = ([int]$bucketAfterSale.ventasAsociadas -eq 1)
    stockMatch = ([int]$rawAfterSale.stock -eq $expectedStockAfterSale)
  }
  step8_closeBucket = [pscustomobject]@{
    closeStatus = $step8Close.StatusCode
    id = $bucketAfterClose.id
    estado = $bucketAfterClose.estado
    fechaCierre = $bucketAfterClose.fechaCierre
    closedStateVerified = ($bucketAfterClose.estado -eq 'cerrado')
  }
}

$result | ConvertTo-Json -Depth 10
