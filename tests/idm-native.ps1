# Native regression fixture only: no Chrome profile or real IDM instance used.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../src/agent/idm-ui.ps1" -LibraryOnly
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class IdmPanelFixture : NativeWindow {
  public int Clicks;
  public int ClickX;
  public IdmPanelFixture(IntPtr parent, string className, int x) {
    var handle = CreateWindowEx(0, className, "", 0x50000000, x, 80, 180, 24, parent, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
    if (handle == IntPtr.Zero) throw new Exception("Cannot create native panel fixture: " + Marshal.GetLastWin32Error());
    AssignHandle(handle);
    ShowWindow(handle, 5);
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x202) { Clicks++; ClickX = (int)((long)m.LParam & 0xffff); }
    base.WndProc(ref m);
  }
  public static void Register(string name) {
    var c = new WNDCLASS(); c.className = name; c.proc = Marshal.GetFunctionPointerForDelegate(defaultProc);
    if (RegisterClass(ref c) == 0) throw new Exception("Cannot register fixture window class");
  }
  private delegate IntPtr Proc(IntPtr h, uint m, IntPtr w, IntPtr l);
  private static Proc defaultProc = DefWindowProc;
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] private struct WNDCLASS {
    public uint style; public IntPtr proc; public int classExtra, windowExtra;
    public IntPtr instance, icon, cursor, background;
    public string menuName, className;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern ushort RegisterClass(ref WNDCLASS c);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr CreateWindowEx(uint ex, string cls, string title, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr DefWindowProc(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@
function Check($condition, $message) { if (-not $condition) { throw $message } }
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Isolated IDM native regression fixture'
$form.StartPosition = 'Manual'; $form.Location = New-Object System.Drawing.Point(100,200)
$form.Size = New-Object System.Drawing.Size(640,360)
$form.TopMost = $true
$panel = $null; $outside = $null; $other = $null
try {
  $form.Show(); $form.Activate(); [System.Windows.Forms.Application]::DoEvents()
  [void][IdmPanelFixture]::ShowWindow($form.Handle, 5)
  $script:fixtureHandle = $form.Handle
  $script:boundBrowserHandle = $form.Handle; $script:boundBrowserPid = $PID
  $script:idmPid = -1
  # Replace only marker discovery: all panel discovery, bounds, PID and input
  # checks are the production functions exercised against real native HWNDs.
  function ChromeWindow { return $AE::FromHandle($script:fixtureHandle) }
  [IdmPanelFixture]::Register('IDM Download Button class')
  [IdmPanelFixture]::Register('Unrelated download button')
  $panel = New-Object IdmPanelFixture($form.Handle, 'IDM Download Button class', 30)
  $outside = New-Object IdmPanelFixture($form.Handle, 'IDM Download Button class', 900)
  $other = New-Object IdmPanelFixture($form.Handle, 'Unrelated download button', 300)
  [System.Windows.Forms.Application]::DoEvents()
  $found = @(NativePanels)
  if ($found.Count -ne 1) {
    $r = New-Object IdmNative+Rect; [void][IdmNative]::GetWindowRect($panel.Handle, [ref]$r)
    [Console]::WriteLine((@{ count=$found.Count; class=[IdmNative]::ClassName($panel.Handle); visible=[IdmNative]::IsWindowVisible($panel.Handle); enabled=[IdmNative]::IsWindowEnabled($panel.Handle); rect=$r; browser=(ChromeWindow).Current.BoundingRectangle; allowed=(PanelHandleAllowed $panel.Handle) } | ConvertTo-Json -Compress))
  }
  Check ($found.Count -eq 1 -and $found[0] -eq $panel.Handle) 'Must discover the unlabeled Chrome-owned native panel, excluding an off-window panel'
  Check (-not (PanelHandleAllowed $other.Handle)) 'Must reject an unrelated native class'
  [void][IdmPanelFixture]::ShowWindow($panel.Handle, 0)
  Check (-not (PanelHandleAllowed $panel.Handle)) 'Must wait until the native panel is actually visible'
  [void][IdmPanelFixture]::ShowWindow($panel.Handle, 5)
  $script:boundBrowserPid = $PID + 100000
  Check (-not (PanelHandleAllowed $panel.Handle)) 'Must reject a panel from an unrelated process'
  $script:boundBrowserPid = $PID
  $form.Activate()
  [void][IdmNative]::SetForegroundWindow($form.Handle)
  $focusUntil = [DateTime]::UtcNow.AddSeconds(2)
  do { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 20 } while (-not (ScopeReady) -and [DateTime]::UtcNow -lt $focusUntil)
  if (ScopeReady) {
    ClickNativePanel $panel.Handle
    $deadline = [DateTime]::UtcNow.AddSeconds(2)
    do { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 20 } while ($panel.Clicks -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    Check ($panel.Clicks -eq 1) 'Native mouse input must click the floating panel exactly once'
    Check ($panel.ClickX -lt 100) 'Must click the download region, away from help/close buttons'
    Check ($script:clickedPanel -eq $panel.Handle) 'Native menu scope must remember the verified panel'
    [Console]::WriteLine('Native injected floating panel discovery, process/bounds isolation and click: OK')
  } else {
    # Background/locked test runners may not acquire foreground. Verify that
    # production refuses input rather than disabling its focus guard for tests.
    $refused = $false
    try { ClickNativePanel $panel.Handle } catch { $refused = $_.Exception.Message -match 'focus' }
    Check ($refused -and $panel.Clicks -eq 0) 'Must refuse native input without fixture focus'
    [Console]::WriteLine('Native injected floating panel discovery, process/bounds isolation and focus guard: OK (desktop denied foreground; click not exercised)')
  }
} finally {
  if ($panel) { $panel.DestroyHandle() }; if ($outside) { $outside.DestroyHandle() }; if ($other) { $other.DestroyHandle() }
  $form.Close(); $form.Dispose()
}
