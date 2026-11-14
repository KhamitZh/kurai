# NNN Куратор: Windows Проводник арқылы папка таңдау терезесін ашады.
# Таңдалған папканың толық жолын шығарады (бас тартса — бос жол).
param([string]$Initial = '')

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms

$code = @'
using System;
using System.Runtime.InteropServices;

public static class NnnFolderPicker {
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRCW { }

    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr hwnd);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder();
        void GetCurrentSelection();
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName();
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel();
        void GetResult(out IShellItem ppsi);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes();
        void Compare();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IShellItem ppv);

    public static string Pick(IntPtr owner, string initial, string title, string okLabel) {
        IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();
        uint opts;
        dlg.GetOptions(out opts);
        dlg.SetOptions(opts | 0x20 | 0x40); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
        dlg.SetTitle(title);
        dlg.SetOkButtonLabel(okLabel);
        if (!String.IsNullOrEmpty(initial) && System.IO.Directory.Exists(initial)) {
            try {
                IShellItem folder;
                SHCreateItemFromParsingName(initial, IntPtr.Zero, typeof(IShellItem).GUID, out folder);
                dlg.SetFolder(folder);
            } catch { }
        }
        int hr = dlg.Show(owner);
        if (hr != 0) return null; // бас тартты
        IShellItem result;
        dlg.GetResult(out result);
        IntPtr p;
        result.GetDisplayName(0x80058000, out p); // SIGDN_FILESYSPATH
        string path = Marshal.PtrToStringUni(p);
        Marshal.FreeCoTaskMem(p);
        return path;
    }
}
'@

# Терезе браузердің үстінде ашылуы үшін көрінбейтін «иесі» терезе жасаймыз
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show()
$owner.Activate()

try {
    Add-Type -TypeDefinition $code -Language CSharp
    $path = [NnnFolderPicker]::Pick($owner.Handle, $Initial, 'NNN Куратор — папканы таңдаңыз', 'Осы папканы таңдау')
} catch {
    # Ескі Windows үшін қарапайым терезе
    $f = New-Object System.Windows.Forms.FolderBrowserDialog
    $f.Description = 'NNN Куратор — папканы таңдаңыз'
    $f.ShowNewFolderButton = $true
    if ($Initial -and (Test-Path $Initial)) { $f.SelectedPath = $Initial }
    $path = if ($f.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath } else { $null }
} finally {
    $owner.Close()
}

if ($path) { [Console]::Out.Write($path) }
