import { type ChildProcess, spawn } from 'node:child_process'
import readline from 'node:readline'

import { createRightCtrlGestureMachine, type RightCtrlGestureCallbacks } from './right-ctrl-gesture'

const WIN32_RIGHT_CTRL_HOOK_PS = `
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class RightCtrlHook {
  private const int WH_KEYBOARD_LL = 13;
  private const int WM_KEYDOWN = 0x0100;
  private const int WM_KEYUP = 0x0101;
  private const int WM_SYSKEYDOWN = 0x0104;
  private const int WM_SYSKEYUP = 0x0105;
  private const int VK_RCONTROL = 0xA3;

  private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
  private static LowLevelKeyboardProc _proc = HookCallback;
  private static IntPtr _hookID = IntPtr.Zero;
  private static bool _rCtrlDown = false;

  public static void Run() {
    using (Process curProcess = Process.GetCurrentProcess())
    using (ProcessModule curModule = curProcess.MainModule) {
      _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
    }
    Application.Run();
    if (_hookID != IntPtr.Zero) {
      UnhookWindowsHookEx(_hookID);
    }
  }

  private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int vkCode = Marshal.ReadInt32(lParam);
      int msg = wParam.ToInt32();
      bool isDown = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN);
      bool isUp = (msg == WM_KEYUP || msg == WM_SYSKEYUP);
      if (vkCode == VK_RCONTROL) {
        if (isDown && !_rCtrlDown) {
          _rCtrlDown = true;
          Console.WriteLine("{\\"e\\":\\"down\\"}");
          Console.Out.Flush();
        } else if (isUp && _rCtrlDown) {
          _rCtrlDown = false;
          Console.WriteLine("{\\"e\\":\\"up\\"}");
          Console.Out.Flush();
        }
      } else if (isDown && _rCtrlDown) {
        Console.WriteLine("{\\"e\\":\\"other\\"}");
        Console.Out.Flush();
      }
    }
    return CallNextHookEx(_hookID, nCode, wParam, lParam);
  }

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool UnhookWindowsHookEx(IntPtr hhk);

  [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  private static extern IntPtr GetModuleHandle(string lpModuleName);
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
[RightCtrlHook]::Run()
`

export interface RightCtrlMonitor {
  dispose: () => void
  start: () => void
}

export function createRightCtrlMonitor(
  callbacks: RightCtrlGestureCallbacks,
  log: (message: string) => void
): RightCtrlMonitor {
  const machine = createRightCtrlGestureMachine(callbacks)
  let child: ChildProcess | null = null
  let disposed = false

  const start = () => {
    if (disposed || child || process.platform !== 'win32' || process.env.TEST_WORKER_INDEX) {
      return
    }

    try {
      const encoded = Buffer.from(WIN32_RIGHT_CTRL_HOOK_PS, 'utf16le').toString('base64')
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        }
      )

      if (child.stdout) {
        const rl = readline.createInterface({ input: child.stdout })
        rl.on('line', line => {
          try {
            const parsed = JSON.parse(line.trim()) as { e?: string }

            if (parsed.e === 'down') {
              machine.onKeyDown()
            } else if (parsed.e === 'up') {
              machine.onKeyUp()
            } else if (parsed.e === 'other') {
              machine.onOtherKeyDown()
            }
          } catch {
            // Ignore non-JSON lines.
          }
        })
      }

      child.on('error', err => {
        log(`right-ctrl monitor spawn error: ${err.message}`)
      })
      child.on('exit', () => {
        child = null
      })
    } catch (err) {
      log(`right-ctrl monitor failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const dispose = () => {
    disposed = true
    machine.dispose()

    if (child && !child.killed) {
      try {
        child.kill()
      } catch {
        // Best-effort cleanup.
      }

      child = null
    }
  }

  return { dispose, start }
}
