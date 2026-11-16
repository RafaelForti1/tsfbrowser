// Instalador do TSF Browser (por usuário, sem precisar de administrador).
//   TSFBrowser-Setup.exe            -> instala com interface
//   TSFBrowser-Setup.exe /S         -> instala em silêncio
//   uninstall.exe /uninstall        -> desinstala (copiado para a pasta de instalação)
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

class Setup : Form
{
    const string AppName = "TSF Browser";
    const string Version = "0.2.0";
    const string Publisher = "TSF";
    const string UninstKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\TSFBrowser";
    static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "TSF Browser");
    static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TSFBrowser");
    static readonly string StartMenuLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "TSF Browser.lnk");
    static readonly string DesktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "TSF Browser.lnk");
    static readonly Color Bg = Color.FromArgb(12, 14, 24), Fg = Color.FromArgb(244, 245, 248), Muted = Color.FromArgb(146, 153, 170), Primary = Color.FromArgb(105, 92, 255);

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    readonly bool uninstall;
    Label title, info;
    CheckBox chkDesktop, chkData;
    Button btnMain, btnCancel;
    ProgressBar bar;
    Image logo;
    bool done;
    float dpiScale = 1f;

    [STAThread]
    static int Main(string[] args)
    {
        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        bool un = args.Any(a => a.Equals("/uninstall", StringComparison.OrdinalIgnoreCase));
        bool silent = args.Any(a => a.Equals("/S", StringComparison.OrdinalIgnoreCase));
        if (silent)
        {
            try { if (un) DoUninstall(false); else DoInstall(true, null); return 0; }
            catch { return 1; }
        }
        Application.Run(new Setup(un));
        return 0;
    }

    Setup(bool un)
    {
        uninstall = un;
        float k; using (var g = CreateGraphics()) k = g.DpiX / 96f;
        dpiScale = k;
        Func<int, int> S = v => (int)Math.Round(v * k);
        Text = (un ? "Desinstalar " : "Instalar ") + AppName;
        FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(S(520), S(330));
        BackColor = Bg; ForeColor = Fg;
        Font = new Font("Segoe UI", 9.5f);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        try { var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo.png"); if (s != null) logo = Image.FromStream(s); } catch { }
        DoubleBuffered = true;

        title = new Label { Text = un ? "Desinstalar o TSF Browser" : "TSF Browser " + Version, Font = new Font("Segoe UI Semibold", 17f), AutoSize = true, Location = new Point(S(128), S(38)), BackColor = Color.Transparent };
        info = new Label
        {
            Text = un ? "O navegador, os atalhos e o registro serão removidos deste computador."
                      : "Navegador para desenvolvedores, motor Chromium.\nSerá instalado só para você, sem pedir permissão de administrador:\n" + InstallDir,
            ForeColor = Muted, Location = new Point(S(130), S(80)), Size = new Size(S(370), S(80)), BackColor = Color.Transparent
        };
        chkDesktop = new CheckBox { Text = "Criar atalho na área de trabalho", Checked = true, Location = new Point(S(130), S(170)), AutoSize = true, Visible = !un };
        chkData = new CheckBox { Text = "Apagar também histórico, sessões e logins salvos", Checked = false, Location = new Point(S(130), S(170)), AutoSize = true, Visible = un };
        bar = new ProgressBar { Location = new Point(S(130), S(210)), Size = new Size(S(360), S(8)), Style = ProgressBarStyle.Continuous, Visible = false };
        btnMain = new Button { Text = un ? "Desinstalar" : "Instalar", Size = new Size(S(130), S(38)), Location = new Point(S(360), S(266)), FlatStyle = FlatStyle.Flat, BackColor = Primary, ForeColor = Color.White, Font = new Font("Segoe UI Semibold", 10f) };
        btnMain.FlatAppearance.BorderSize = 0;
        btnCancel = new Button { Text = "Cancelar", Size = new Size(S(110), S(38)), Location = new Point(S(240), S(266)), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(28, 33, 50), ForeColor = Fg };
        btnCancel.FlatAppearance.BorderColor = Color.FromArgb(50, 58, 80);
        btnCancel.Click += (s, e) => Close();
        btnMain.Click += async (s, e) => await Run();
        Controls.AddRange(new Control[] { title, info, chkDesktop, chkData, bar, btnMain, btnCancel });
        AcceptButton = btnMain;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        float k = dpiScale;
        using (var br = new LinearGradientBrush(new Rectangle(0, 0, Width, Height), Color.FromArgb(40, 105, 92, 255), Color.FromArgb(0, 37, 217, 242), 45f))
            g.FillRectangle(br, ClientRectangle);
        if (logo != null) g.DrawImage(logo, new Rectangle((int)(30 * k), (int)(36 * k), (int)(80 * k), (int)(80 * k)));
    }

    async Task Run()
    {
        if (done)
        {
            if (!uninstall) try { Process.Start(Path.Combine(InstallDir, "TSFBrowser.exe")); } catch { }
            Close();
            return;
        }
        btnMain.Enabled = false; btnCancel.Enabled = false; chkDesktop.Enabled = false; chkData.Enabled = false;
        bar.Visible = true; bar.Value = 10;
        bool desktop = chkDesktop.Checked, wipe = chkData.Checked;
        try
        {
            if (Process.GetProcessesByName("TSFBrowser").Length > 0)
            {
                if (MessageBox.Show(this, "O TSF Browser está aberto. Fechar agora para continuar?", Text, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK)
                { Reset(); return; }
                foreach (var p in Process.GetProcessesByName("TSFBrowser")) { try { p.CloseMainWindow(); if (!p.WaitForExit(4000)) p.Kill(); } catch { } }
            }
            var progress = new Progress<int>(v => bar.Value = Math.Min(100, v));
            if (uninstall) await Task.Run(() => DoUninstall(wipe));
            else await Task.Run(() => DoInstall(desktop, progress));
            bar.Value = 100;
            done = true;
            title.Text = uninstall ? "TSF Browser removido" : "Instalação concluída";
            info.Text = uninstall ? "Obrigado por testar o TSF Browser." : "O TSF Browser está no Menu Iniciar" + (desktop ? " e na área de trabalho." : ".");
            btnMain.Text = uninstall ? "Fechar" : "Abrir agora";
            btnMain.Enabled = true;
            chkDesktop.Visible = chkData.Visible = false;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Não foi possível concluir:\n\n" + ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Reset();
        }
    }

    void Reset() { btnMain.Enabled = btnCancel.Enabled = chkDesktop.Enabled = chkData.Enabled = true; bar.Visible = false; }

    static void DoInstall(bool desktop, IProgress<int> progress)
    {
        Directory.CreateDirectory(InstallDir);
        using (var res = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
        using (var zip = new ZipArchive(res, ZipArchiveMode.Read))
        {
            // remove a interface antiga para não sobrar arquivo de versões anteriores
            string shellDir = Path.Combine(InstallDir, "shell");
            if (Directory.Exists(shellDir)) Directory.Delete(shellDir, true);
            int i = 0, n = zip.Entries.Count;
            foreach (var entry in zip.Entries)
            {
                string dest = Path.GetFullPath(Path.Combine(InstallDir, entry.FullName));
                if (!dest.StartsWith(InstallDir, StringComparison.OrdinalIgnoreCase)) continue;
                if (string.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(dest); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                entry.ExtractToFile(dest, true);
                if (progress != null) progress.Report(10 + 75 * (++i) / Math.Max(1, n));
            }
        }
        string exe = Path.Combine(InstallDir, "TSFBrowser.exe");
        string uninst = Path.Combine(InstallDir, "uninstall.exe");
        File.Copy(Application.ExecutablePath, uninst, true);

        CreateShortcut(StartMenuLnk, exe);
        if (desktop) CreateShortcut(DesktopLnk, exe);
        if (progress != null) progress.Report(92);

        long size = new DirectoryInfo(InstallDir).GetFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) / 1024;
        using (var key = Registry.CurrentUser.CreateSubKey(UninstKey))
        {
            key.SetValue("DisplayName", AppName);
            key.SetValue("DisplayVersion", Version);
            key.SetValue("Publisher", Publisher);
            key.SetValue("DisplayIcon", exe);
            key.SetValue("InstallLocation", InstallDir);
            key.SetValue("UninstallString", "\"" + uninst + "\" /uninstall");
            key.SetValue("QuietUninstallString", "\"" + uninst + "\" /uninstall /S");
            key.SetValue("EstimatedSize", (int)size, RegistryValueKind.DWord);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
        using (var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\TSFBrowser.exe"))
        {
            key.SetValue("", exe);
            key.SetValue("Path", InstallDir);
        }
    }

    static void DoUninstall(bool wipeData)
    {
        foreach (var f in new[] { StartMenuLnk, DesktopLnk }) try { if (File.Exists(f)) File.Delete(f); } catch { }
        try { Registry.CurrentUser.DeleteSubKeyTree(UninstKey, false); } catch { }
        try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\App Paths\TSFBrowser.exe", false); } catch { }
        if (wipeData) try { if (Directory.Exists(DataDir)) Directory.Delete(DataDir, true); } catch { }
        // o desinstalador está dentro da pasta: agenda a remoção para depois que ele fechar
        string cmd = "/c timeout /t 2 /nobreak >nul & rmdir /s /q \"" + InstallDir + "\"";
        Process.Start(new ProcessStartInfo("cmd.exe", cmd) { CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, UseShellExecute = false });
    }

    static void CreateShortcut(string lnk, string target)
    {
        var t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        try
        {
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
            var st = sc.GetType();
            st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { Path.GetDirectoryName(target) });
            st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
            st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "TSF Browser — navegador para desenvolvedores" });
            st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            Marshal.FinalReleaseComObject(sc);
        }
        finally { Marshal.FinalReleaseComObject(shell); }
    }
}
