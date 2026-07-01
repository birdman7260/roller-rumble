<#
    Probe-OpenSprints.ps1

    A throwaway recon tool for the OpenSprints race box. It does NOT change
    anything on the hardware or the PC. It:

      1. Lists every serial (COM) device the PC can see, with USB IDs.
      2. Opens the box at 115200 baud and asks its firmware version (`v`).
      3. Starts a streaming race (`g`) with a finish line set far away so the
         box never stops on its own.
      4. Walks you through pedalling ONE bike at a time so we can learn which
         sensor position belongs to which lane.
      5. Saves EVERYTHING it sees to a timestamped .txt file next to this
         script. Email that file back.

    It logs the raw bytes regardless of firmware version, so even if this box
    is an older variant than expected, the capture is still useful.

    You normally do not need to pass any options. If auto-detect picks the
    wrong port, re-run as:  powershell -ExecutionPolicy Bypass -File Probe-OpenSprints.ps1 -Port COM5
#>

[CmdletBinding()]
param(
    [string]$Port = "",
    [int]$BaudRate = 115200,
    [int]$PhaseSeconds = 12
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Logging: everything goes to the console AND a timestamped file beside this script.
# ---------------------------------------------------------------------------
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logPath = Join-Path $scriptDir "opensprints-capture_$stamp.txt"

function Write-Log {
    param([string]$Text = "")
    Write-Host $Text
    # Add-Content works on even very old PowerShell (no -Append-on-Tee dependency).
    try { Add-Content -Path $logPath -Value $Text } catch {}
}

function Write-Banner {
    param([string]$Text)
    Write-Log ""
    Write-Log "==================================================================="
    Write-Log "  $Text"
    Write-Log "==================================================================="
}

Write-Log "OpenSprints probe - capture started $(Get-Date)"
Write-Log "Saving everything to: $logPath"
Write-Log "PowerShell version: $($PSVersionTable.PSVersion)  |  OS: $([System.Environment]::OSVersion.VersionString)  |  64-bit OS: $([System.Environment]::Is64BitOperatingSystem)"

# ---------------------------------------------------------------------------
# 1. Enumerate serial devices (works on any class; shows USB VID/PID).
# ---------------------------------------------------------------------------
Write-Banner "STEP 1 of 4: Devices the PC can see"

$portNames = @()
try {
    # Wrap in @(...) so a single port stays an array; otherwise the pipeline
    # unwraps it to a bare string and $portNames[0] later returns just "C".
    $portNames = @([System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object)
} catch {
    Write-Log "Could not list COM ports: $($_.Exception.Message)"
}

if ($portNames.Count -eq 0) {
    Write-Log "No COM ports found at all. Is the box plugged in and powered? Try a different USB cable/port, then run this again."
} else {
    Write-Log "COM ports present: $($portNames -join ', ')"
}

# Friendly names + USB IDs via WMI (available even on very old PowerShell).
try {
    Write-Log ""
    Write-Log "Serial/USB devices with details (look for FTDI, Arduino, CH340, Silicon Labs / CP210x):"
    $devices = Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match "\(COM\d+\)" -or $_.Name -match "Arduino|FTDI|CH340|CP210|Silicon Labs|USB Serial" }
    if ($devices) {
        foreach ($d in $devices) {
            Write-Log ("  - {0}" -f $d.Name)
            Write-Log ("      HardwareID: {0}" -f ($d.PNPDeviceID))
        }
    } else {
        Write-Log "  (no obviously-serial USB devices matched; the COM list above is the source of truth)"
    }
} catch {
    Write-Log "WMI device lookup unavailable: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Choose a port.
# ---------------------------------------------------------------------------
if ([string]::IsNullOrEmpty($Port)) {
    if ($portNames.Count -eq 1) {
        $Port = $portNames[0]
        Write-Log ""
        Write-Log "Using the only COM port found: $Port"
    } elseif ($portNames.Count -gt 1) {
        Write-Log ""
        Write-Log "More than one COM port found. Type the one the race box uses (e.g. COM3) and press Enter."
        Write-Log "If unsure: unplug the box, see which port disappears next run, or just try one."
        $Port = (Read-Host "Port").Trim()
    } else {
        Write-Log "No port to open. Stopping here - send the file above to Michael."
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Open the port.
# ---------------------------------------------------------------------------
Write-Banner "STEP 2 of 4: Connecting to $Port at $BaudRate baud"

$serial = New-Object System.IO.Ports.SerialPort $Port, $BaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
$serial.ReadTimeout = 250
$serial.NewLine = "`n"
$serial.DtrEnable = $true   # Arduino auto-resets when DTR asserts; that is expected.

try {
    $serial.Open()
} catch {
    Write-Log "Could not open $($Port): $($_.Exception.Message)"
    Write-Log "If it says 'Access denied', the OLD race app is probably still running and holding the port. Close it completely and run this again."
    exit 1
}

Write-Log "Port opened. Waiting 2.5s for the box to finish booting..."
Start-Sleep -Milliseconds 2500
$serial.DiscardInBuffer()

# Helper: drain whatever the box has sent for a number of seconds, logging it raw.
# Reads arrive in arbitrary chunks that can split a line mid-way, so we keep a
# rolling buffer and only emit COMPLETE lines; a trailing partial line is held
# over until the rest arrives (and flushed at the end).
function Read-ForSeconds {
    param([int]$Seconds, [string]$Label)
    $deadline = (Get-Date).AddSeconds($Seconds)
    $buffer = ""
    while ((Get-Date) -lt $deadline) {
        try {
            $chunk = $serial.ReadExisting()
            if ($chunk -and $chunk.Length -gt 0) {
                $buffer += $chunk
                $parts = $buffer -split "`r`n|`n|`r"
                # Everything except the last element is a complete line.
                for ($k = 0; $k -lt $parts.Count - 1; $k++) {
                    if ($parts[$k].Trim().Length -gt 0) {
                        Write-Log ("[{0}] {1}" -f $Label, $parts[$k].Trim())
                    }
                }
                $buffer = $parts[$parts.Count - 1]   # possibly-incomplete remainder
            }
        } catch [System.TimeoutException] {
            # no data this slice; keep waiting
        }
        Start-Sleep -Milliseconds 50
    }
    if ($buffer.Trim().Length -gt 0) {
        Write-Log ("[{0}] {1}" -f $Label, $buffer.Trim())
    }
}

# ---------------------------------------------------------------------------
# Firmware protocol notes (verified against two real sketches):
#
#   opensprints/basic_msg   -> reports version "basic-1"   (this is our box)
#       v            : prints "basic-1"
#       l <lo><hi>CR : set finish distance in TICKS as TWO RAW BYTES then a CR.
#                      NOT ascii digits, and the terminator must be CR (0x0D),
#                      never LF. Sending "l60000\n" jams the length parser and it
#                      then swallows the next 'g', so the race never starts and
#                      nothing streams -- exactly the empty capture we saw.
#       g            : GO. ~4s silent countdown, then streams every 250ms:
#                          "0: <ticks>" "1: <ticks>" "2: <ticks>" "3: <ticks>" "t: <ms>"
#                      crossing the finish line prints "<lane>f: <ms>".
#       m            : toggle MOCK mode (box invents ticks; lets us test w/o bikes)
#       s            : stop
#
#   cwhitney/SilverSprint ss_basic -> reports "V:SS_vX.Y.Z" (newer variant)
#       l/t take ASCII digits + newline; streams "R:t0,t1,t2,t3,ms"; acks "M:ON/OFF".
#       We only need to recognise it so we set the race length the right way.
#
# Commands are single bytes with NO trailing newline; only 'l' takes a terminator.
# ---------------------------------------------------------------------------
function Send-Cmd {
    param([string]$Text)
    $b = [System.Text.Encoding]::ASCII.GetBytes($Text)
    $serial.Write($b, 0, $b.Length)
}

function Set-RaceLengthBasic {
    param([int]$Ticks)
    $lo = [byte]($Ticks -band 0xFF)
    $hi = [byte](($Ticks -shr 8) -band 0xFF)
    $b = [byte[]]@([byte][char]'l', $lo, $hi, [byte]13)   # 'l', low, high, CR (0x0D)
    $serial.Write($b, 0, $b.Length)
}

# Ask the firmware to identify itself. The DTR-triggered reset means it may still
# be booting, so retry. Expect "basic-1" (or "V:SS_..." on the newer variant).
Write-Log "Asking the box for its firmware version..."
$versionText = ""
for ($i = 1; $i -le 5 -and [string]::IsNullOrEmpty($versionText); $i++) {
    Send-Cmd "v"
    Start-Sleep -Milliseconds 400
    $resp = ""
    try { $resp = $serial.ReadExisting() } catch {}
    if ($resp) {
        foreach ($line in ($resp -split "`r?`n")) {
            if ($line.Trim().Length -gt 0) {
                Write-Log ("[version] {0}" -f $line.Trim())
                if ([string]::IsNullOrEmpty($versionText)) { $versionText = $line.Trim() }
            }
        }
    }
}
if ([string]::IsNullOrEmpty($versionText)) {
    Write-Log "[version] (no reply). The box may still be usable; the raw capture below still helps."
}

$isSilverSprint = ($versionText -match "SS_|^V:")

# Push the finish line far away (30000 ticks) so no lane auto-finishes and the box
# keeps streaming for the whole test. 30000 fits basic_msg's signed 16-bit int
# (60000 overflowed to -5536); a lane only reaches a few hundred ticks in a test.
# Encoding differs per firmware (see notes).
if ($isSilverSprint) {
    Send-Cmd "l30000`r"       # ss_basic parses ascii digits, CR-terminated
} else {
    Set-RaceLengthBasic 30000 # basic_msg parses two raw bytes, CR-terminated
}
Start-Sleep -Milliseconds 300
Read-ForSeconds -Seconds 1 -Label "setup"    # basic_msg echoes "OK 30000"; ss echoes "L:30000"

# --- Self-test with NO bikes: mock mode makes the box invent ticks. ----------
# Proves the whole start -> stream -> capture path even before anyone pedals.
Write-Log ""
Write-Log "Quick self-test (no pedalling needed): asking the box to fake some ticks..."
Send-Cmd "m"                  # mock ON
Send-Cmd "g"                  # GO (countdown, then streams fake ticks)
Read-ForSeconds -Seconds 10 -Label "MOCK-selftest"
Send-Cmd "s"                  # stop
Send-Cmd "m"                  # mock OFF -- IMPORTANT: back to real sensors
Start-Sleep -Milliseconds 300
$serial.DiscardInBuffer()

Write-Banner "STEP 3 of 4: Lane test - pedal ONE bike at a time"
Write-Log "Starting a real race. The box counts down (about 4 seconds) before it streams data."
Write-Log "Real data lines look like:  0: 12   1: 0   2: 0   3: 0   t: 3456   (ticks per lane, then ms)"
Send-Cmd "g"                  # GO - begins countdown then streaming
Read-ForSeconds -Seconds 5 -Label "countdown"

Write-Log ""
Write-Log ">>> When you're ready, pedal ONLY the LEFT bike for about $PhaseSeconds seconds."
Read-Host "    Press Enter, THEN start pedalling the LEFT bike" | Out-Null
Read-ForSeconds -Seconds $PhaseSeconds -Label "LEFT-bike"

Write-Log ""
Write-Log ">>> Now stop. Next, pedal ONLY the RIGHT bike for about $PhaseSeconds seconds."
Read-Host "    Press Enter, THEN start pedalling the RIGHT bike" | Out-Null
Read-ForSeconds -Seconds $PhaseSeconds -Label "RIGHT-bike"

Write-Log ""
Write-Log ">>> Last capture (optional but helpful): pedal ALL bikes together."
Write-Log "    If there are more than two bikes, this catches the extra ones too."
Read-Host "    Press Enter, THEN pedal all bikes for a few seconds" | Out-Null
Read-ForSeconds -Seconds 6 -Label "ALL-bikes"

# Stop the race and close cleanly.
Write-Banner "STEP 4 of 4: Done - cleaning up"
Send-Cmd "s"
Start-Sleep -Milliseconds 300
try { $serial.Close() } catch {}

Write-Log ""
Write-Log "All finished. The full capture is saved here:"
Write-Log "    $logPath"
Write-Log ""
Write-Log "Please EMAIL that .txt file back to Michael. Thank you!"
Write-Log ""

# Also measure: ask Wyatt for the roller diameter so we can calibrate distance.
Write-Log "One last thing (for distance calibration):"
$diameter = Read-Host "If you can, measure the ROLLER (the drum the wheel spins on) diameter in mm and type it here, else just press Enter"
if (-not [string]::IsNullOrEmpty($diameter)) {
    Write-Log "Roller diameter reported: $diameter mm"
}

Write-Log "Capture ended $(Get-Date)."
Read-Host "Press Enter to close this window"
