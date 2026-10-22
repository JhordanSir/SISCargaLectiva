# Prepara los logotipos de la interfaz a partir de los originales de marca/fuente/:
#   universidad-la-salle-logo.jpg → lasalle.png (recortado al contenido, sin el fondo blanco)
#   logoWayrasimi.png             → wayrasimi.png (pie) y wayrasimi-marca.png (spinner), trazo blanco con alfa
# Usa System.Drawing, así que corre en Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File AppScript\estilos\marca\procesar-logos.ps1
# Después, «npm run construir» en AppScript/estilos los incrusta en Estilos.html.
param([string]$Raiz = (Join-Path $PSScriptRoot 'fuente'), [string]$Salida = $PSScriptRoot)

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

public static class Logos {
  static byte[] Leer(Bitmap b, out int paso) {
    var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    paso = d.Stride;
    var buf = new byte[paso * b.Height];
    Marshal.Copy(d.Scan0, buf, 0, buf.Length);
    b.UnlockBits(d);
    return buf;
  }
  static void Escribir(Bitmap b, byte[] buf) {
    var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    Marshal.Copy(buf, 0, d.Scan0, buf.Length);
    b.UnlockBits(d);
  }
  static double Lim(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  public static Bitmap A32(Image src) {
    var b = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(b)) g.DrawImage(src, 0, 0, src.Width, src.Height);
    return b;
  }

  /* Contenido: sobre blanco, un canal por debajo de 255-umbral; sobre oscuro, luminancia por encima del umbral. */
  static bool EsContenido(byte[] buf, int i, bool sobreBlanco, int umbral) {
    int B = buf[i], G = buf[i + 1], R = buf[i + 2];
    if (sobreBlanco) return 255 - Math.Min(R, Math.Min(G, B)) > umbral;
    return 0.2126 * R + 0.7152 * G + 0.0722 * B > umbral;
  }

  public static Rectangle Caja(Bitmap b, bool sobreBlanco, int umbral, int y0, int y1) {
    int paso; var buf = Leer(b, out paso);
    int minX = b.Width, minY = b.Height, maxX = -1, maxY = -1;
    for (int y = y0; y < y1; y++)
      for (int x = 0; x < b.Width; x++)
        if (EsContenido(buf, y * paso + x * 4, sobreBlanco, umbral)) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
    return Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
  }

  /* Franja vacía más alta entre y0 e y1: separa el dibujo del texto. Devuelve su fila central. */
  public static int Hueco(Bitmap b, bool sobreBlanco, int umbral, int y0, int y1) {
    int paso; var buf = Leer(b, out paso);
    int mejorIni = -1, mejorLargo = 0, ini = -1;
    for (int y = y0; y < y1; y++) {
      bool vacia = true;
      for (int x = 0; x < b.Width && vacia; x++) if (EsContenido(buf, y * paso + x * 4, sobreBlanco, umbral)) vacia = false;
      if (vacia) { if (ini < 0) ini = y; if (y - ini + 1 > mejorLargo) { mejorLargo = y - ini + 1; mejorIni = ini; } }
      else ini = -1;
    }
    return mejorIni < 0 ? -1 : mejorIni + mejorLargo / 2;
  }

  public static Rectangle Ampliar(Rectangle r, double margen, int ancho, int alto) {
    int m = (int)Math.Round(Math.Max(r.Width, r.Height) * margen);
    return Rectangle.FromLTRB(Math.Max(0, r.Left - m), Math.Max(0, r.Top - m), Math.Min(ancho, r.Right + m), Math.Min(alto, r.Bottom + m));
  }

  public static Bitmap Recortar(Bitmap b, Rectangle r, int alto, Color fondo) {
    int ancho = (int)Math.Round(r.Width * (double)alto / r.Height);
    var o = new Bitmap(ancho, alto, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(o)) {
      g.Clear(fondo);
      g.InterpolationMode = InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = PixelOffsetMode.HighQuality;
      g.SmoothingMode = SmoothingMode.HighQuality;
      g.CompositingQuality = CompositingQuality.HighQuality;
      using (var ia = new ImageAttributes()) {
        ia.SetWrapMode(WrapMode.TileFlipXY);
        g.DrawImage(b, new Rectangle(0, 0, ancho, alto), r.X, r.Y, r.Width, r.Height, GraphicsUnit.Pixel, ia);
      }
    }
    return o;
  }

  /* «Color a alfa» con el blanco: el logotipo queda igual sobre blanco y transparente alrededor. */
  public static void BlancoAAlfa(Bitmap b, double piso) {
    int paso; var buf = Leer(b, out paso);
    for (int y = 0; y < b.Height; y++)
      for (int x = 0; x < b.Width; x++) {
        int i = y * paso + x * 4;
        double B = buf[i] / 255.0, G = buf[i + 1] / 255.0, R = buf[i + 2] / 255.0;
        double a = Math.Max(1 - R, Math.Max(1 - G, 1 - B));
        if (a <= piso) { buf[i] = buf[i + 1] = buf[i + 2] = 255; buf[i + 3] = 0; continue; }
        buf[i]     = (byte)Math.Round(Lim((B - 1) / a + 1) * 255);
        buf[i + 1] = (byte)Math.Round(Lim((G - 1) / a + 1) * 255);
        buf[i + 2] = (byte)Math.Round(Lim((R - 1) / a + 1) * 255);
        buf[i + 3] = (byte)Math.Round(Lim((a - piso) / (1 - piso)) * 255);
      }
    Escribir(b, buf);
  }

  /* Trazos claros sobre fondo oscuro: blanco puro con alfa según la luminancia. */
  public static void ClaroAAlfaBlanco(Bitmap b, double bajo, double alto) {
    int paso; var buf = Leer(b, out paso);
    for (int y = 0; y < b.Height; y++)
      for (int x = 0; x < b.Width; x++) {
        int i = y * paso + x * 4;
        double l = 0.2126 * buf[i + 2] + 0.7152 * buf[i + 1] + 0.0722 * buf[i];
        double a = Lim((l - bajo) / (alto - bajo));
        buf[i] = buf[i + 1] = buf[i + 2] = 255;
        buf[i + 3] = (byte)Math.Round(a * 255);
      }
    Escribir(b, buf);
  }
}
'@

New-Item -ItemType Directory -Force $Salida | Out-Null
function Guardar($bmp, $nombre) {
  $ruta = Join-Path $Salida $nombre
  $bmp.Save($ruta, [System.Drawing.Imaging.ImageFormat]::Png)
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($ruta))
  Set-Content -Path ($ruta + '.b64') -Value $b64 -NoNewline -Encoding ascii
  "{0}: {1}x{2}, {3} bytes, base64 {4} caracteres" -f $nombre, $bmp.Width, $bmp.Height, (Get-Item $ruta).Length, $b64.Length
}

# --- LaSalle: logotipo completo, recortado al contenido y sin el fondo blanco ---
$src = [System.Drawing.Image]::FromFile((Join-Path $Raiz 'universidad-la-salle-logo.jpg'))
$ls = [Logos]::A32($src); $src.Dispose()
$caja = [Logos]::Caja($ls, $true, 40, 0, $ls.Height)
"LaSalle contenido: $caja"
$caja = [Logos]::Ampliar($caja, 0.03, $ls.Width, $ls.Height)
$out = [Logos]::Recortar($ls, $caja, 200, [System.Drawing.Color]::White)
[Logos]::BlancoAAlfa($out, 0.035)
Guardar $out 'lasalle.png'
$out.Dispose(); $ls.Dispose()

# --- Wayrasimi: lockup completo (pie) y solo el dibujo (spinner), trazo blanco con alfa ---
$src = [System.Drawing.Image]::FromFile((Join-Path $Raiz 'logoWayrasimi.png'))
$wy = [Logos]::A32($src); $src.Dispose()
$caja = [Logos]::Caja($wy, $false, 110, 0, $wy.Height)
"Wayrasimi contenido: $caja"
$hueco = [Logos]::Hueco($wy, $false, 110, $caja.Top + [int]($caja.Height * 0.3), $caja.Bottom - [int]($caja.Height * 0.1))
"Wayrasimi hueco entre dibujo y texto: fila $hueco"
$completo = [Logos]::Ampliar($caja, 0.04, $wy.Width, $wy.Height)
$out = [Logos]::Recortar($wy, $completo, 120, [System.Drawing.Color]::Black)
[Logos]::ClaroAAlfaBlanco($out, 52, 215)
Guardar $out 'wayrasimi.png'
$out.Dispose()
$marca = [Logos]::Caja($wy, $false, 110, $caja.Top, $hueco)
"Wayrasimi dibujo: $marca"
$marca = [Logos]::Ampliar($marca, 0.03, $wy.Width, $wy.Height)
$out = [Logos]::Recortar($wy, $marca, 132, [System.Drawing.Color]::Black)
[Logos]::ClaroAAlfaBlanco($out, 52, 215)
Guardar $out 'wayrasimi-marca.png'
$out.Dispose(); $wy.Dispose()
