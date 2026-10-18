param([switch]$ValidateOnly, [string]$InspectMarker, [switch]$LibraryOnly)
# JSON-lines adapter. Only windows of the marked Chrome tab and IDMan are used.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public static class IdmNative {
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder name, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rectangle);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  public static string ClassName(IntPtr window) { var s = new StringBuilder(256); GetClassName(window, s, s.Capacity); return s.ToString(); }
  public static IntPtr[] Windows(IntPtr browser, int browserProcess, int idmProcess) {
    var result = new HashSet<IntPtr>();
    EnumProc add = (window, unused) => { result.Add(window); return true; };
    EnumWindows((window, unused) => {
      uint pid; GetWindowThreadProcessId(window, out pid);
      if (pid == (uint)browserProcess || pid == (uint)idmProcess) result.Add(window);
      return true;
    }, IntPtr.Zero);
    foreach (var window in new List<IntPtr>(result)) EnumChildWindows(window, add, IntPtr.Zero);
    EnumChildWindows(browser, add, IntPtr.Zero);
    return new List<IntPtr>(result).ToArray();
  }
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr child);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
}
'@
$AE = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$allCondition = [System.Windows.Automation.Condition]::TrueCondition
function Emit($value) { [Console]::WriteLine(($value | ConvertTo-Json -Compress -Depth 8)) }
function Progress($message) { Emit @{ event = 'progress'; message = $message } }
function Roots { return @($AE::RootElement.FindAll($Scope::Children, $allCondition)) }
function IdmRoots { return @(Roots | Where-Object { $_.Current.ProcessId -eq $script:idmPid }) }
function Descendants($element) { return @($element.FindAll($Scope::Descendants, $allCondition)) }
function PanelHandleAllowed([IntPtr]$handle) {
  # IDM's injected floating button is a native HWND, often owned by Chrome,
  # not IDMan.exe and not a DOM element. Match the actual IDM window class.
  if ([IdmNative]::ClassName($handle) -ne 'IDM Download Button class' -or -not [IdmNative]::IsWindowVisible($handle) -or -not [IdmNative]::IsWindowEnabled($handle)) { return $false }
  $ownerPid = [uint32]0; [void][IdmNative]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
  if ($ownerPid -ne $script:idmPid -and $ownerPid -ne $script:boundBrowserPid) { return $false }
  $rect = New-Object IdmNative+Rect
  if (-not [IdmNative]::GetWindowRect($handle, [ref]$rect)) { return $false }
  $width = $rect.Right - $rect.Left; $height = $rect.Bottom - $rect.Top
  $bounds = (ChromeWindow).Current.BoundingRectangle
  return ($width -ge 40 -and $width -lt 800 -and $height -ge 12 -and $height -lt 150 -and $bounds.Contains($rect.Left, $rect.Top) -and $bounds.Contains($rect.Right - 1, $rect.Bottom - 1))
}
function NativePanels {
  $browser = ChromeWindow
  foreach ($handle in ([IdmNative]::Windows([IntPtr]$browser.Current.NativeWindowHandle, $script:boundBrowserPid, $script:idmPid))) {
    if (PanelHandleAllowed $handle) { $handle }
  }
}
function NativeMenuAllowed($element) {
  if (-not $script:clickedPanel -or $element.Current.ProcessId -ne $script:boundBrowserPid -or $element.Current.ClassName -ne '#32768') { return $false }
  $bounds = (ChromeWindow).Current.BoundingRectangle
  $rect = $element.Current.BoundingRectangle
  return (-not $element.Current.IsOffscreen -and $rect.Width -gt 0 -and $rect.Height -gt 0 -and $bounds.Contains($rect.Left + $rect.Width / 2, $rect.Top + $rect.Height / 2))
}
function ClickNativePanel([IntPtr]$handle) {
  AssertScope
  if (-not (PanelHandleAllowed $handle)) { throw 'Panel IDM đã thay đổi hoặc nằm ngoài Chrome đã chọn' }
  $rect = New-Object IdmNative+Rect; [void][IdmNative]::GetWindowRect($handle, [ref]$rect)
  # The trailing help/close buttons belong to the same custom-drawn HWND.
  # Click the download region in its left half, never the help/close region.
  $point = New-Object IdmNative+Point
  $point.X = $rect.Left + [int](($rect.Right - $rect.Left) * 0.4)
  $point.Y = $rect.Top + [int](($rect.Bottom - $rect.Top) / 2)
  $hit = [IdmNative]::WindowFromPoint($point)
  if ($hit -ne $handle -and -not [IdmNative]::IsChild($handle, $hit)) { throw 'Panel IDM bị cửa sổ khác che; chưa click' }
  AssertScope
  if (-not [IdmNative]::SetCursorPos($point.X, $point.Y)) { throw 'Không di chuyển được con trỏ tới panel IDM; chưa click' }
  [IdmNative]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [IdmNative]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  $script:clickedPanel = $handle
}
function IdmElements {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($root in (IdmRoots)) {
    foreach ($element in (@($root) + @(Descendants $root))) {
      if ($element.Current.ProcessId -eq $script:idmPid -and $seen.Add(($element.GetRuntimeId() -join '.'))) { $element }
    }
  }
  # Some IDM builds parent the panel to Chrome rather than expose a top-level
  # IDM window. Include only IDMan-owned descendants of the already bound HWND.
  $browserHandle = [IntPtr](ChromeWindow).Current.NativeWindowHandle
  foreach ($handle in ([IdmNative]::Windows($browserHandle, $script:boundBrowserPid, $script:idmPid))) {
    $ownerPid = [uint32]0; [void][IdmNative]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
    if ($ownerPid -eq $script:idmPid -and [IdmNative]::IsChild($browserHandle, $handle)) {
      $root = $AE::FromHandle($handle)
      foreach ($element in (@($root) + @(Descendants $root))) {
        if ($seen.Add(($element.GetRuntimeId() -join '.'))) { $element }
      }
    }
  }
  # Custom-drawn injected controls can have a different PID from IDMan. UIA
  # roots are recovered from verified native handles, not from web source.
  foreach ($handle in (NativePanels)) {
    $root = $AE::FromHandle($handle)
    foreach ($element in (@($root) + @(Descendants $root))) {
      if ($seen.Add(($element.GetRuntimeId() -join '.'))) { $element }
    }
  }
  if ($script:clickedPanel) {
    # A popup menu created by the injected DLL belongs to Chrome too.
    foreach ($root in (Roots)) {
      if (NativeMenuAllowed $root) {
        foreach ($element in (@($root) + @(Descendants $root))) {
          if ($seen.Add(($element.GetRuntimeId() -join '.'))) { $element }
        }
      }
    }
  }
}
function Value($element) {
  $pattern = $null
  if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { return $pattern.Current.Value }
  return ''
}
function ChromeWindow {
  # Bind the native handle once. UIA window names may lag document.title while
  # YouTube updates metadata; never switch to a different Chrome window.
  $markerUntil = [DateTime]::UtcNow.AddSeconds(3)
  do {
    if ($script:boundBrowserHandle) {
      $window = $AE::FromHandle($script:boundBrowserHandle)
      if ($window.Current.ProcessId -ne $script:boundBrowserPid) { throw 'Chrome window identity changed' }
      if ($window.Current.Name.Contains($script:config.marker)) { return $window }
    } else {
      $windows = @(Roots | Where-Object { $_.Current.Name.Contains($script:config.marker) -and $_.Current.ClassName -like 'Chrome_WidgetWin*' })
      if ($windows.Count -gt 1) { throw 'Có nhiều cửa sổ cùng marker IDM; chưa thao tác.' }
      if ($windows.Count -eq 1) {
        if ((Get-Process -Id $windows[0].Current.ProcessId).ProcessName -ne 'chrome') { throw 'IDM marker is not in Chrome' }
        $script:boundBrowserHandle = [IntPtr]$windows[0].Current.NativeWindowHandle
        $script:boundBrowserPid = $windows[0].Current.ProcessId
        return $windows[0]
      }
    }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $markerUntil)
  throw 'Mất marker của cửa sổ Chrome đã chọn quá 3 giây. Không chuyển tab/cửa sổ trong bước IDM.'
}
function ScopeReady {
  $browser = ChromeWindow
  $foreground = [IdmNative]::GetForegroundWindow()
  $foregroundPid = [uint32]0
  [void][IdmNative]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  $browserHandle = [IntPtr]$browser.Current.NativeWindowHandle
  if ($foreground -eq $browserHandle -or [IdmNative]::IsChild($browserHandle, $foreground) -or $foregroundPid -eq $script:idmPid) { return $true }
  if (PanelHandleAllowed $foreground) { return $true }
  if ($script:clickedPanel -and $foregroundPid -eq $script:boundBrowserPid -and [IdmNative]::ClassName($foreground) -eq '#32768') {
    return (NativeMenuAllowed ($AE::FromHandle($foreground)))
  }
  return $false
}
function AssertScope {
  if (-not (ScopeReady)) { throw 'Cửa sổ khác đang có focus. Dừng thao tác IDM để tránh click nhầm profile.' }
}
function WaitForScope($deadline, $resumeMessage) {
  $waiting = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    if (ScopeReady) { if ($waiting) { Progress $resumeMessage }; return }
    if (-not $waiting) { Progress 'Đang chờ focus: đưa cửa sổ Chrome của video lên trước để tiếp tục IDM'; $waiting = $true }
    Start-Sleep -Milliseconds 200
  }
  throw 'Hết thời gian chờ focus cửa sổ Chrome của video. Chưa click IDM.'
}
function Click($element) {
  AssertScope
  if ($element.Current.ProcessId -ne $script:idmPid) {
    # Only a native menu opened by our verified IDM panel may use Chrome PID.
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $parent = $element; $nativeMenu = $false
    while ($null -ne $parent) {
      if (NativeMenuAllowed $parent) { $nativeMenu = $true; break }
      $parent = $walker.GetParent($parent)
    }
    if (-not $nativeMenu) { throw 'Refusing non-IDM control' }
  }
  if (-not $element.Current.IsEnabled) { throw 'IDM control is disabled' }
  $pattern = $null
  if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke(); return }
  if ($element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) { $pattern.Select(); return }
  $point = New-Object System.Windows.Point
  if (-not $element.TryGetClickablePoint([ref]$point)) { throw 'IDM control has no clickable point. This IDM UI version is unsupported.' }
  $nativePoint = New-Object IdmNative+Point
  $nativePoint.X = [int]$point.X; $nativePoint.Y = [int]$point.Y
  $top = [IdmNative]::WindowFromPoint($nativePoint)
  $topPid = [uint32]0; [void][IdmNative]::GetWindowThreadProcessId($top, [ref]$topPid)
  if ($topPid -ne $element.Current.ProcessId) { throw 'IDM control is covered by another window' }
  if (-not [IdmNative]::SetCursorPos($nativePoint.X, $nativePoint.Y)) { throw 'Không di chuyển được con trỏ tới control IDM; chưa click' }
  [IdmNative]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [IdmNative]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}
function DownloadDialog {
  $dialogs = @(IdmRoots | Where-Object { $_.Current.Name -match '(?i)Download File Info|Thông tin (tệp|file|tải|tập tin)|Thông tin bản tải' })
  if ($dialogs.Count -gt 1) { throw 'Có nhiều hộp thoại tải IDM. Đóng các hộp thoại cũ trước khi chạy.' }
  if ($dialogs.Count -eq 1) { return $dialogs[0] }
  return $null
}
if ($LibraryOnly) { return }
if ($ValidateOnly) { Emit @{ event = 'validated'; adapter = 'idm-ui'; panelLabel = 'Tải video này' }; exit 0 }
if ($InspectMarker) {
  try {
    if ($InspectMarker -notmatch '^Workflow-IDM-[a-f0-9-]{36}$') { throw 'Invalid inspection marker' }
    $script:config = @{ marker = $InspectMarker }
    $script:idmPid = (Get-Process -Name IDMan -ErrorAction Stop | Select-Object -First 1).Id
    $browser = ChromeWindow
    $buttons = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $items = @($browser.FindAll($Scope::Descendants, $buttons)) + @(IdmElements)
    $controls = @(foreach ($element in $items) {
      $current = $element.Current
      if ($current.Name -match '(?i)IDM|download|tải' -or $current.HelpText -match '(?i)download.*video|tải.*video') {
        @{ name = $current.Name; help = $current.HelpText; processId = $current.ProcessId; class = $current.ClassName; controlType = $current.ControlType.ProgrammaticName; offscreen = $current.IsOffscreen }
      }
    })
    $nativePanels = @(foreach ($handle in (NativePanels)) { @{ handle = $handle.ToInt64(); class = [IdmNative]::ClassName($handle) } })
    Emit @{ event = 'inspection'; browserProcessId = $browser.Current.ProcessId; idmProcessId = $script:idmPid; controls = $controls; nativePanels = $nativePanels }
    exit 0
  } catch { Emit @{ event = 'error'; message = $_.Exception.Message }; exit 1 }
}
try {
  [void][IdmNative]::SetThreadDpiAwarenessContext([IntPtr](-4))
  $script:config = [Console]::ReadLine() | ConvertFrom-Json
  if ($config.marker -notmatch '^Workflow-IDM-[a-f0-9-]{36}$') { throw 'Invalid browser marker' }
  $processes = @(Get-Process -Name IDMan -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0 -and $config.idmPath -and (Test-Path -LiteralPath $config.idmPath -PathType Leaf)) {
    Start-Process -FilePath $config.idmPath -WindowStyle Hidden
    $launchUntil = [DateTime]::UtcNow.AddSeconds(5)
    do { Start-Sleep -Milliseconds 200; $processes = @(Get-Process -Name IDMan -ErrorAction SilentlyContinue) } while ($processes.Count -eq 0 -and [DateTime]::UtcNow -lt $launchUntil)
  }
  if ($processes.Count -ne 1) { throw 'Mở Internet Download Manager trước; chỉ hỗ trợ một IDMan process.' }
  $script:idmPid = $processes[0].Id
  if (DownloadDialog) { throw 'Đang có hộp thoại Download File Info cũ. Đóng hộp thoại đó rồi chạy lại.' }
  $browser = ChromeWindow
  [void][IdmNative]::SetForegroundWindow([IntPtr]$browser.Current.NativeWindowHandle)
  $until = [DateTime]::UtcNow.AddMilliseconds($config.timeoutMs)
  Progress 'Đang chờ nút Download this video / Tải video này của IDM'
  $panel = $null
  $nativePanel = [IntPtr]::Zero
  while ([DateTime]::UtcNow -lt $until) {
    WaitForScope $until 'Đang chờ nút Download this video / Tải video này của IDM'
    $nativeCandidates = @(NativePanels)
    if ($nativeCandidates.Count -gt 1) { throw 'Có nhiều panel IDM trên Chrome đã chọn. Chỉ để một video trong tab.' }
    if ($nativeCandidates.Count -eq 1) { $nativePanel = $nativeCandidates[0]; break }
    $bounds = (ChromeWindow).Current.BoundingRectangle
    $candidates = @(foreach ($element in (IdmElements)) {
        $current = $element.Current; $rect = $current.BoundingRectangle
        $panelName = '(?i)^(Download (this )?video|Tải (xuống )?video này|IDM.*Download.*Panel)'
        if (-not $current.IsOffscreen -and $current.IsEnabled -and ($current.Name -match $panelName -or $current.HelpText -match $panelName) -and $rect.Width -gt 0 -and $rect.Width -lt 800 -and $rect.Height -lt 300 -and $bounds.Contains($rect.Left + $rect.Width / 2, $rect.Top + $rect.Height / 2)) { $element }
    })
    # Prefer a button to its enclosing panel with the same accessible name.
    $buttons = @($candidates | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button })
    if ($buttons.Count -eq 1) { $panel = $buttons[0]; break }
    if ($buttons.Count -gt 1 -or $candidates.Count -gt 1) { throw 'IDM hiển thị nhiều panel video. Chỉ để một video trong tab hoặc chọn video rõ ràng trước.' }
    if ($candidates.Count -eq 1) { $panel = $candidates[0]; break }
    Start-Sleep -Milliseconds 250
  }
  if ($nativePanel -ne [IntPtr]::Zero) { ClickNativePanel $nativePanel }
  elseif ($panel) { Click $panel }
  else { throw 'Không thấy panel nổi IDM trên cửa sổ Chrome đã chọn. Kiểm tra IDM Integration Module và phát video; nút này không phải element của website.' }
  Progress 'Đang đọc danh sách chất lượng IDM'
  $choices = @()
  $lastChoices = ''; $choicesStableSince = [DateTime]::UtcNow
  while ([DateTime]::UtcNow -lt $until) {
    WaitForScope $until 'Đang đọc danh sách chất lượng IDM'
    $choices = @(foreach ($element in (IdmElements)) {
        if (-not $element.Current.IsOffscreen -and $element.Current.IsEnabled -and $element.Current.Name -match '(?:\b(1080|720)\s*(p|px)?\b|\b\d{3,4}\s*[x×]\s*(1080|720)\b)' -and $element.Current.ControlType -in @([System.Windows.Automation.ControlType]::MenuItem, [System.Windows.Automation.ControlType]::ListItem, [System.Windows.Automation.ControlType]::Button)) { $element }
    })
    $signature = ($choices | ForEach-Object { $_.Current.Name }) -join '|'
    if ($signature -ne $lastChoices) { $lastChoices = $signature; $choicesStableSince = [DateTime]::UtcNow }
    if ($choices.Count -gt 0 -and ([DateTime]::UtcNow - $choicesStableSince).TotalMilliseconds -ge 500) { break }
    if (DownloadDialog) { throw 'IDM mở tải trực tiếp mà không cung cấp menu chất lượng. Chưa tải vì không xác minh được 1080p/720p.' }
    Start-Sleep -Milliseconds 200
  }
  if ($choices.Count -eq 0) { throw 'Không đọc được menu chất lượng IDM hoặc không có 1080p/720p.' }
  $options = @(for ($i = 0; $i -lt $choices.Count; $i++) { @{ id = $i; label = $choices[$i].Current.Name } })
  Emit @{ event = 'qualities'; options = $options }
  $selection = [Console]::ReadLine() | ConvertFrom-Json
  if ($null -eq $selection -or $selection.choice -lt 0 -or $selection.choice -ge $choices.Count) { throw 'Invalid IDM quality selection' }
  if ($choices[[int]$selection.choice].Current.Name -ne $options[[int]$selection.choice].label) { throw 'Menu chất lượng IDM vừa thay đổi. Chưa chọn tải.' }
  Click $choices[[int]$selection.choice]
  Progress ('Đã chọn ' + $options[[int]$selection.choice].label)
  $dialog = $null
  while ([DateTime]::UtcNow -lt $until) {
    WaitForScope $until 'Đang chờ Download File Info'; $dialog = DownloadDialog
    if ($dialog) { break }
    Start-Sleep -Milliseconds 200
  }
  if (-not $dialog) { throw 'IDM không hiện Download File Info sau khi chọn chất lượng' }
  $edits = @(Descendants $dialog | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and $_.Current.IsEnabled -and
    ($_.Current.Name -match '(?i)Save As|Lưu (thành|vào|tại)|Đường dẫn' -or (Value $_) -match '^[a-zA-Z]:\\|^\\\\')
  })
  if ($edits.Count -ne 1) { throw 'Không xác định duy nhất ô Save As trong IDM. Chưa bắt đầu tải.' }
  $saveAs = $edits[0]
  $suggested = [IO.Path]::GetFileName((Value $saveAs))
  $filename = if ($config.filename) { [string]$config.filename } else { $suggested }
  if (-not $filename -or $filename -ne [IO.Path]::GetFileName($filename) -or $filename.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw 'Tên file IDM không hợp lệ. Điền filename trong kịch bản.' }
  $destination = [IO.Path]::Combine($config.directory, $filename)
  if (Test-Path -LiteralPath $destination) {
    if ($config.filename) { throw 'File đích đã tồn tại. Đổi filename; agent không ghi đè.' }
    $stem = [IO.Path]::GetFileNameWithoutExtension($filename); $extension = [IO.Path]::GetExtension($filename); $suffix = 2
    do { $filename = "$stem-$suffix$extension"; $destination = [IO.Path]::Combine($config.directory, $filename); $suffix++ } while (Test-Path -LiteralPath $destination)
  }
  AssertScope
  $pattern = $null
  if (-not $saveAs.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern) -or $pattern.Current.IsReadOnly) { throw 'IDM Save As không hỗ trợ nhập đường dẫn' }
  $pattern.SetValue($destination)
  if ((Value $saveAs) -ne $destination) { throw 'IDM không nhận đường dẫn Save As' }
  $start = @(Descendants $dialog | Where-Object { $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $_.Current.Name -match '(?i)^(&?Start Download|Bắt đầu tải( xuống)?|Tải (ngay|xuống))\s*$' })
  if ($start.Count -ne 1) { throw 'Không xác định nút Start Download trong IDM' }
  # Check again immediately before submission: never accept overwrite dialogs.
  if (Test-Path -LiteralPath $destination) { throw 'File đích vừa được tạo bởi chương trình khác; không ghi đè.' }
  Click $start[0]
  Progress ('Đang tải: ' + $destination)
  $downloadUntil = [DateTime]::UtcNow.AddMilliseconds($config.downloadTimeoutMs)
  $lastSize = -1; $stableSince = [DateTime]::UtcNow
  while ([DateTime]::UtcNow -lt $downloadUntil) {
    # Download may continue in the background; no more pointer/keyboard input.
    if (Test-Path -LiteralPath $destination -PathType Leaf) {
      $size = (Get-Item -LiteralPath $destination).Length
      if ($size -ne $lastSize) { $lastSize = $size; $stableSince = [DateTime]::UtcNow }
      $transfers = @(IdmRoots | Where-Object { $_.Current.Name.Contains($filename) -and $_.Current.Name -notmatch '(?i)Download complete|Tải (xuống )?hoàn tất|Tải xong' })
      if ($size -gt 0 -and $transfers.Count -eq 0 -and ([DateTime]::UtcNow - $stableSince).TotalSeconds -ge 3) {
        Emit @{ event = 'complete'; filePath = $destination }; exit 0
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw 'Hết thời gian chờ tải xong. Kiểm tra IDM; agent không tự thử tải lại để tránh file trùng.'
} catch {
  Emit @{ event = 'error'; message = $_.Exception.Message }
  exit 1
}
