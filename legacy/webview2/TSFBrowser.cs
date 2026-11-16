// TSF Browser — host nativo (WinForms + WebView2 / Chromium).
// A interface inteira vive em shell/ (HTML/CSS/JS) e conversa com este host por mensagens.
// Cada aba (e cada dispositivo do Responsive Lab) é um WebView2 próprio; o shell envia um
// "layout" com os retângulos onde cada um deve aparecer (aba única, Split View, Lab...).
// Cada workspace usa um perfil isolado (cookies, logins e armazenamento separados).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class View
{
    public string Id, Ws, Ua;
    public WebView2 Wv;
    public Task Ready;
    public bool Loading, Lab, NetHooked, Inspect, Thumbing;
    public Size RegionSize;
    public int RegionRadius = -1;
    public CoreWebView2 Core { get { return Wv.CoreWebView2; } }
}

class LayoutItem
{
    public string Id;
    public Rectangle R;
    public int Radius;
    public double Zoom;
}

class TsfBrowser : Form
{
    public const string AppName = "TSF Browser";
    public const string AppVersion = "0.2.0";
    const string ShellOrigin = "https://tsf.shell/";
    static readonly bool Debug = Environment.GetEnvironmentVariable("TSF_DEBUG") == "1";
    static readonly string DataDir = Debug && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TSF_DATA"))
        ? Environment.GetEnvironmentVariable("TSF_DATA")
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TSFBrowser");
    static readonly string ThumbDir = Path.Combine(DataDir, "thumbs");
    static readonly string ShellDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "shell");
    static readonly string ShotsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "TSF Browser");
    static readonly string[] SaveFiles = { "state", "history", "sessions" };
    static readonly Color Bg = Color.FromArgb(9, 11, 18);

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int val, int size);
    [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr h, ref MARGINS m);

    [StructLayout(LayoutKind.Sequential)] struct MARGINS { public int l, r, t, b; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct MINMAXINFO { public POINT reserved, maxSize, maxPosition, minTrack, maxTrack; }

    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    readonly Dictionary<string, View> views = new Dictionary<string, View>();
    readonly HashSet<string> keys = new HashSet<string>();
    readonly string[] startArgs;

    WebView2 shell;
    CoreWebView2Environment env;
    List<LayoutItem> layout = new List<LayoutItem>();
    string primaryId, fsId;
    bool overlay, fullScreen, shellReady, closeAllowed, nativeDrag;
    FormWindowState fsPrevState;
    Rectangle fsPrevBounds;
    int border;
    float k = 1f;

    [STAThread]
    static void Main(string[] args)
    {
        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new TsfBrowser(args));
    }

    public TsfBrowser(string[] args)
    {
        startArgs = args;
        using (var g = CreateGraphics()) k = g.DpiX / 96f;
        border = (int)Math.Round(5 * k);
        Text = AppName;
        BackColor = Bg;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        var wa = Screen.PrimaryScreen.WorkingArea;
        Size = new Size(Math.Min(S(1440), wa.Width - S(40)), Math.Min(S(900), wa.Height - S(40)));
        MinimumSize = new Size(S(860), S(560));
        Padding = new Padding(border);
        DoubleBuffered = true;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        shell = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Bg };
        Controls.Add(shell);
    }

    int S(int v) { return (int)Math.Round(v * k); }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.Style |= 0x00020000 | 0x00010000 | 0x00080000; // MINIMIZEBOX | MAXIMIZEBOX | SYSMENU
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4);   // cantos arredondados (Win11)
            int policy = 2; DwmSetWindowAttribute(Handle, 2, ref policy, 4);  // sombra da janela
            var m = new MARGINS { l = 0, r = 0, t = 0, b = 1 };
            DwmExtendFrameIntoClientArea(Handle, ref m);
        }
        catch { }
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        try
        {
            Directory.CreateDirectory(DataDir);
            Directory.CreateDirectory(ThumbDir);
            if (!File.Exists(Path.Combine(ShellDir, "index.html"))) throw new FileNotFoundException("Pasta 'shell' não encontrada ao lado do executável.");
            env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataDir, "Engine"), null);
            await shell.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Não foi possível iniciar o TSF Browser.\n\n" + ex.Message +
                "\n\nVerifique se o Microsoft Edge WebView2 Runtime está instalado.", AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            closeAllowed = true; Close();
            return;
        }

        HookController(shell, null);
        var c = shell.CoreWebView2;
        var st = c.Settings;
        st.AreDefaultContextMenusEnabled = false;
        st.AreBrowserAcceleratorKeysEnabled = false;
        st.IsZoomControlEnabled = false;
        st.IsStatusBarEnabled = false;
        st.IsSwipeNavigationEnabled = false;
        st.IsPinchZoomEnabled = false;
        st.AreDevToolsEnabled = Debug;
        nativeDrag = TrySetSetting(st, "IsNonClientRegionSupportEnabled", true);

        c.SetVirtualHostNameToFolderMapping("tsf.shell", ShellDir, CoreWebView2HostResourceAccessKind.Deny);
        c.SetVirtualHostNameToFolderMapping("tsf.thumbs", ThumbDir, CoreWebView2HostResourceAccessKind.DenyCors);
        c.WebMessageReceived += OnShellMessage;
        c.NewWindowRequested += (s, a) => a.Handled = true;
        c.NavigationStarting += (s, a) => { if (!a.Uri.StartsWith(ShellOrigin)) a.Cancel = true; };
        c.ProcessFailed += (s, a) => { if (a.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited) { try { c.Reload(); } catch { } } };
        c.Navigate(ShellOrigin + "index.html");
        Task.Run(() => PruneThumbs());
    }

    static bool TrySetSetting(object settings, string name, object value)
    {
        try
        {
            var p = settings.GetType().GetProperty(name);
            if (p == null) return false;
            p.SetValue(settings, value, null);
            return true;
        }
        catch { return false; }
    }

    // ---------------- Mensagens shell <-> host ----------------

    void Post(Dictionary<string, object> d)
    {
        if (!shellReady || shell.CoreWebView2 == null) return;
        try { shell.CoreWebView2.PostWebMessageAsJson(json.Serialize(d)); } catch { }
    }

    void Post(string type, params object[] kv)
    {
        var d = new Dictionary<string, object> { { "type", type } };
        for (int i = 0; i + 1 < kv.Length; i += 2) d[(string)kv[i]] = kv[i + 1];
        Post(d);
    }

    void Toast(string text) { Post("toast", "text", text); }

    static string Str(Dictionary<string, object> m, string key)
    {
        object v; return m.TryGetValue(key, out v) && v != null ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) : null;
    }

    static double Num(object v)
    {
        if (v == null) return 0;
        try { return Convert.ToDouble(v, System.Globalization.CultureInfo.InvariantCulture); } catch { return 0; }
    }

    static double Num(Dictionary<string, object> m, string key)
    {
        object v; return m.TryGetValue(key, out v) ? Num(v) : 0;
    }

    static bool Bool(Dictionary<string, object> m, string key)
    {
        object v; return m.TryGetValue(key, out v) && v is bool && (bool)v;
    }

    static IEnumerable List(Dictionary<string, object> m, string key)
    {
        object v; return m.TryGetValue(key, out v) && v is IEnumerable && !(v is string) ? (IEnumerable)v : new object[0];
    }

    View Get(string id)
    {
        View t; return id != null && views.TryGetValue(id, out t) ? t : null;
    }

    void OnShellMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (e.Source == null || !e.Source.StartsWith(ShellOrigin)) return;
        Dictionary<string, object> m;
        try { m = json.DeserializeObject(e.WebMessageAsJson) as Dictionary<string, object>; } catch { return; }
        if (m == null) return;
        var t = Get(Str(m, "id"));
        if (Debug && Str(m, "type") != "save") try { File.AppendAllText(Path.Combine(DataDir, "debug.log"), DateTime.Now.ToString("HH:mm:ss.fff ") + e.WebMessageAsJson + "\r\n"); } catch { }

        switch (Str(m, "type"))
        {
            case "ready":
                keys.Clear();
                foreach (var o in List(m, "keys")) if (o != null) keys.Add(o.ToString());
                shellReady = true;
                Post(new Dictionary<string, object> {
                    { "type", "init" },
                    { "state", ReadText(Path.Combine(DataDir, "state.json")) },
                    { "history", ReadText(Path.Combine(DataDir, "history.json")) },
                    { "sessions", ReadText(Path.Combine(DataDir, "sessions.json")) },
                    { "nativeDrag", nativeDrag },
                    { "maximized", WindowState == FormWindowState.Maximized },
                    { "engine", env.BrowserVersionString },
                    { "version", AppVersion },
                    { "shots", ShotsDir },
                    { "debug", Debug },
                    { "run", Debug ? startArgs.Where(a => a.StartsWith("--run=")).Select(a => a.Substring(6)).FirstOrDefault() : null },
                    { "startUrl", startArgs.Any(a => !a.StartsWith("--")) ? string.Join(" ", startArgs.Where(a => !a.StartsWith("--"))) : null }
                });
                break;

            case "layout":
                {
                    var list = new List<LayoutItem>();
                    foreach (var o in List(m, "items"))
                    {
                        var d = o as Dictionary<string, object>;
                        if (d == null) continue;
                        list.Add(new LayoutItem
                        {
                            Id = Str(d, "id"),
                            R = new Rectangle((int)Num(d, "x"), (int)Num(d, "y"), Math.Max(0, (int)Num(d, "w")), Math.Max(0, (int)Num(d, "h"))),
                            Radius = (int)Num(d, "r"),
                            Zoom = Num(d, "zoom")
                        });
                    }
                    layout = list;
                    primaryId = Str(m, "primary");
                    UpdateVisibility();
                    break;
                }

            case "tab:create":
                {
                    string id = Str(m, "id");
                    if (id == null || views.ContainsKey(id)) break;
                    var nt = CreateView(id, Str(m, "ws"), Str(m, "ua"));
                    string url = Str(m, "url");
                    if (!string.IsNullOrEmpty(url)) Navigate(nt, url);
                    break;
                }
            case "tab:navigate": if (t != null) Navigate(t, Str(m, "url")); break;
            case "tab:back": if (t != null && t.Core != null && t.Core.CanGoBack) t.Core.GoBack(); break;
            case "tab:forward": if (t != null && t.Core != null && t.Core.CanGoForward) t.Core.GoForward(); break;
            case "tab:reload": if (t != null && t.Core != null) t.Core.Reload(); break;
            case "tab:stop": if (t != null && t.Core != null) t.Core.Stop(); break;
            case "tab:close": if (t != null) DestroyView(t); break;
            case "tab:devtools": if (t != null && t.Core != null) t.Core.OpenDevToolsWindow(); break;
            case "tab:print": if (t != null && t.Core != null) { try { t.Core.ShowPrintUI(); } catch { } } break;
            case "tab:zoom":
                if (t != null)
                {
                    double z = Bool(m, "reset") ? 1.0 : Math.Max(0.25, Math.Min(5.0, Math.Round((t.Wv.ZoomFactor + Num(m, "delta")) * 100) / 100));
                    t.Wv.ZoomFactor = z;
                    Post("zoom", "id", t.Id, "value", z);
                }
                break;
            case "tab:screenshot": if (t != null) Screenshot(t); break;
            case "tab:thumb": if (t != null) CaptureThumb(t); break;

            case "inspect": if (t != null) SetInspect(t, Bool(m, "on")); break;
            case "net:body": if (t != null) NetBody(t, Str(m, "rid")); break;

            case "probe":
                {
                    var ports = new List<int>();
                    foreach (var o in List(m, "ports")) { int p = (int)Num(o); if (p > 0 && p < 65536 && !ports.Contains(p)) ports.Add(p); }
                    if (ports.Count > 64) ports = ports.Take(64).ToList();
                    Probe(ports, Str(m, "req"));
                    break;
                }

            case "overlay":
                if (Bool(m, "on")) BeginOverlay();
                else { overlay = false; UpdateVisibility(); }
                break;

            case "focus":
                if (Str(m, "target") == "content")
                {
                    var a = Get(primaryId);
                    if (a != null && a.Wv.Visible && !a.Wv.ContainsFocus) a.Wv.Focus();
                }
                else if (!shell.ContainsFocus) shell.Focus();
                break;

            case "save":
                {
                    string file = Str(m, "file"), data = Str(m, "data");
                    if (data != null && Array.IndexOf(SaveFiles, file) >= 0) WriteText(Path.Combine(DataDir, file + ".json"), data);
                    break;
                }

            case "downloads":
                {
                    var a = Get(primaryId);
                    if (a != null && a.Core != null && a.Wv.Visible) a.Core.OpenDefaultDownloadDialog();
                    else Toast("Abra uma página web para ver os downloads.");
                    break;
                }
            case "clear": ClearWorkspaceData(Str(m, "ws")); break;
            case "open-shots":
                try { Directory.CreateDirectory(ShotsDir); Process.Start("explorer.exe", "\"" + ShotsDir + "\""); } catch { }
                break;

            case "win":
                switch (Str(m, "action"))
                {
                    case "min": WindowState = FormWindowState.Minimized; break;
                    case "max": ToggleMaximize(); break;
                    case "close": Close(); break;
                    case "close-now": closeAllowed = true; Close(); break;
                    case "drag":
                        if (WindowState != FormWindowState.Maximized && !fullScreen)
                        {
                            ReleaseCapture();
                            SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); // WM_NCLBUTTONDOWN + HTCAPTION
                        }
                        break;
                }
                break;
        }
    }

    // ---------------- Views (abas e dispositivos do Lab) ----------------

    static string ProfileFor(string ws)
    {
        var sb = new StringBuilder("ws_");
        foreach (char ch in ws ?? "default") if (char.IsLetterOrDigit(ch) || ch == '_' || ch == '-') sb.Append(ch);
        return sb.ToString();
    }

    View CreateView(string id, string ws, string ua)
    {
        var wv = new WebView2 { DefaultBackgroundColor = Bg, Visible = false };
        var t = new View { Id = id, Ws = ws ?? "home", Ua = ua, Wv = wv, Lab = id.StartsWith("lab-") };
        views[id] = t;
        Controls.Add(wv);
        wv.BringToFront();
        var h = wv.Handle; // força a criação da janela para o WebView2 inicializar mesmo oculto
        t.Ready = InitView(t);
        return t;
    }

    async Task InitView(View t)
    {
        try
        {
            var opts = env.CreateCoreWebView2ControllerOptions();
            opts.ProfileName = ProfileFor(t.Ws);
            await t.Wv.EnsureCoreWebView2Async(env, opts);
        }
        catch (Exception ex)
        {
            Toast("Falha ao abrir a aba: " + ex.Message);
            return;
        }
        if (!views.ContainsKey(t.Id)) return;

        HookController(t.Wv, t.Id);
        var c = t.Core;
        c.Settings.IsStatusBarEnabled = false;
        c.Settings.AreDevToolsEnabled = true;
        if (!string.IsNullOrEmpty(t.Ua)) c.Settings.UserAgent = t.Ua;

        c.NavigationStarting += (s, e) => { t.Loading = true; SendState(t); };
        c.NavigationCompleted += async (s, e) =>
        {
            t.Loading = false;
            SendState(t);
            Post("tab:nav", "id", t.Id, "url", c.Source, "title", c.DocumentTitle, "ok", e.IsSuccess, "status", e.WebErrorStatus.ToString());
            if (e.IsSuccess && !t.Lab)
            {
                await Task.Delay(1400);
                if (views.ContainsKey(t.Id) && t.Wv.Visible && !overlay) await CaptureThumb(t);
            }
        };
        c.SourceChanged += (s, e) => SendState(t);
        c.HistoryChanged += (s, e) => SendState(t);
        c.DocumentTitleChanged += (s, e) => SendState(t);
        c.FaviconChanged += (s, e) => Post("tab:favicon", "id", t.Id, "url", c.FaviconUri);
        c.StatusBarTextChanged += (s, e) => Post("status", "id", t.Id, "text", c.StatusBarText);
        c.WindowCloseRequested += (s, e) => Post("tab:close-request", "id", t.Id);
        c.ContainsFullScreenElementChanged += (s, e) => SetFullScreen(t, c.ContainsFullScreenElement);
        c.ProcessFailed += (s, e) => Post("tab:crashed", "id", t.Id, "kind", e.ProcessFailedKind.ToString());
        c.NewWindowRequested += async (s, e) =>
        {
            var deferral = e.GetDeferral();
            try
            {
                string nid = "t" + Guid.NewGuid().ToString("N").Substring(0, 12);
                var nt = CreateView(nid, t.Ws, null);
                await nt.Ready;
                if (nt.Core != null)
                {
                    e.NewWindow = nt.Core;
                    e.Handled = true;
                    Post("tab:opened", "id", nid, "ws", t.Ws, "opener", t.Id, "url", e.Uri);
                }
                else DestroyView(nt);
            }
            catch { }
            finally { deferral.Complete(); }
        };
        if (t.Inspect) HookNet(t, true);
        SendState(t);
    }

    void SendState(View t)
    {
        var c = t.Core;
        if (c == null) return;
        Post(new Dictionary<string, object> {
            { "type", "tab:state" }, { "id", t.Id }, { "url", c.Source }, { "title", c.DocumentTitle },
            { "loading", t.Loading }, { "canBack", c.CanGoBack }, { "canFwd", c.CanGoForward }
        });
    }

    async void Navigate(View t, string url)
    {
        if (string.IsNullOrEmpty(url)) return;
        await t.Ready;
        if (t.Core == null) return;
        try { t.Core.Navigate(url); }
        catch { Toast("Endereço inválido: " + url); }
    }

    void DestroyView(View t)
    {
        views.Remove(t.Id);
        if (fullScreen && t.Id == fsId) SetFullScreen(t, false);
        Controls.Remove(t.Wv);
        try { t.Wv.Dispose(); } catch { }
    }

    bool ShouldShow(string id)
    {
        if (fullScreen) return id == fsId;
        if (overlay) return false;
        foreach (var it in layout) if (it.Id == id) return true;
        return false;
    }

    void UpdateVisibility()
    {
        var show = new Dictionary<string, LayoutItem>();
        if (fullScreen)
        {
            if (Get(fsId) != null) show[fsId] = new LayoutItem { Id = fsId, R = ClientRectangle };
        }
        else if (!overlay)
        {
            foreach (var it in layout) if (it.Id != null && views.ContainsKey(it.Id)) show[it.Id] = it;
        }

        foreach (var kv in show)
        {
            var v = views[kv.Key];
            var it = kv.Value;
            var b = fullScreen ? it.R : new Rectangle(shell.Left + it.R.X, shell.Top + it.R.Y, it.R.Width, it.R.Height);
            if (v.Wv.Bounds != b) v.Wv.Bounds = b;
            ApplyRegion(v, b.Size, fullScreen ? 0 : it.Radius);
            if (it.Zoom > 0.1 && Math.Abs(v.Wv.ZoomFactor - it.Zoom) > 0.001) v.Wv.ZoomFactor = it.Zoom;
            if (!v.Wv.Visible) { v.Wv.Visible = true; v.Wv.BringToFront(); }
        }
        foreach (var v in views.Values.ToList())
        {
            if (show.ContainsKey(v.Id) || !v.Wv.Visible) continue;
            if (!overlay && !fullScreen && !v.Lab) HideAfterThumb(v);
            else v.Wv.Visible = false;
        }
    }

    // Captura uma miniatura antes de esconder a aba (usada pelo Universe e pela Time Machine).
    async void HideAfterThumb(View v)
    {
        if (v.Thumbing) return;
        v.Thumbing = true;
        try { await CaptureThumb(v); } catch { }
        v.Thumbing = false;
        if (views.ContainsKey(v.Id) && !ShouldShow(v.Id)) v.Wv.Visible = false;
    }

    static void ApplyRegion(View t, Size size, int r)
    {
        if (t.RegionSize == size && t.RegionRadius == r) return;
        t.RegionSize = size; t.RegionRadius = r;
        var old = t.Wv.Region;
        if (r <= 0 || size.Width <= 0 || size.Height <= 0) { t.Wv.Region = null; }
        else
        {
            using (var p = new GraphicsPath())
            {
                int d = Math.Min(r * 2, Math.Min(size.Width, size.Height));
                p.AddArc(0, 0, d, d, 180, 90);
                p.AddArc(size.Width - d, 0, d, d, 270, 90);
                p.AddArc(size.Width - d, size.Height - d, d, d, 0, 90);
                p.AddArc(0, size.Height - d, d, d, 90, 90);
                p.CloseFigure();
                t.Wv.Region = new Region(p);
            }
        }
        if (old != null) old.Dispose();
    }

    async void BeginOverlay()
    {
        overlay = true;
        if (!fullScreen)
        {
            foreach (var t in views.Values.ToList())
            {
                if (!t.Wv.Visible || t.Core == null) continue;
                try
                {
                    using (var ms = new MemoryStream())
                    {
                        await t.Core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Jpeg, ms);
                        if (overlay) Post("snapshot", "id", t.Id, "data", "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray()));
                    }
                }
                catch { }
            }
        }
        if (overlay)
        {
            UpdateVisibility();
            shell.Focus();
            Post("overlay:ready");
        }
    }

    // ---------------- Miniaturas ----------------

    public static string Fnv(string s)
    {
        int i = s.IndexOf('#');
        if (i >= 0) s = s.Substring(0, i);
        uint h = 2166136261;
        foreach (char ch in s) { h ^= ch; h *= 16777619; }
        return h.ToString("x8");
    }

    async Task CaptureThumb(View t)
    {
        if (t.Core == null || t.Lab || !t.Wv.Visible) return;
        string url = t.Core.Source ?? "";
        if (!url.StartsWith("http")) return;
        try
        {
            byte[] data;
            using (var ms = new MemoryStream())
            {
                await t.Core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Jpeg, ms);
                data = ms.ToArray();
            }
            string name = Fnv(url);
            await Task.Run(() =>
            {
                using (var src = Image.FromStream(new MemoryStream(data)))
                {
                    int w = Math.Min(560, src.Width);
                    int h = Math.Min((int)(w * 0.75), src.Height * w / Math.Max(1, src.Width));
                    using (var bmp = new Bitmap(w, h))
                    {
                        using (var g = Graphics.FromImage(bmp))
                        {
                            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            g.DrawImage(src, new Rectangle(0, 0, w, src.Height * w / Math.Max(1, src.Width)));
                        }
                        var codec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
                        var ep = new EncoderParameters(1);
                        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 78L);
                        string tmp = Path.Combine(ThumbDir, name + ".tmp");
                        bmp.Save(tmp, codec, ep);
                        string dest = Path.Combine(ThumbDir, name + ".jpg");
                        if (File.Exists(dest)) File.Delete(dest);
                        File.Move(tmp, dest);
                    }
                }
            });
            Post("thumb", "id", t.Id, "name", name, "v", DateTime.UtcNow.Ticks / 10000);
        }
        catch { }
    }

    static void PruneThumbs()
    {
        try
        {
            var files = new DirectoryInfo(ThumbDir).GetFiles("*.jpg");
            if (files.Length <= 2500) return;
            foreach (var f in files.OrderBy(x => x.LastWriteTimeUtc).Take(files.Length - 2000)) { try { f.Delete(); } catch { } }
        }
        catch { }
    }

    // ---------------- Inspector (Chrome DevTools Protocol) ----------------

    static readonly string[] NetEvents = { "Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished", "Network.loadingFailed" };

    void SetInspect(View v, bool on)
    {
        v.Inspect = on;
        HookNet(v, on);
    }

    async void HookNet(View v, bool on)
    {
        await v.Ready;
        if (v.Core == null) return;
        if (on && !v.NetHooked)
        {
            v.NetHooked = true;
            foreach (var ev in NetEvents)
            {
                string name = ev;
                v.Core.GetDevToolsProtocolEventReceiver(name).DevToolsProtocolEventReceived += (s, e) =>
                {
                    if (v.Inspect) Post("net", "id", v.Id, "ev", name, "data", e.ParameterObjectAsJson);
                };
            }
        }
        try { await v.Core.CallDevToolsProtocolMethodAsync(on ? "Network.enable" : "Network.disable", "{}"); } catch { }
    }

    async void NetBody(View v, string rid)
    {
        if (v.Core == null || rid == null) return;
        try
        {
            string r = await v.Core.CallDevToolsProtocolMethodAsync("Network.getResponseBody",
                json.Serialize(new Dictionary<string, object> { { "requestId", rid } }));
            if (r.Length > 3000000) Post("net:body", "id", v.Id, "rid", rid, "error", "Resposta grande demais para exibir (" + (r.Length / 1048576) + " MB).");
            else Post("net:body", "id", v.Id, "rid", rid, "data", r);
        }
        catch (Exception ex) { Post("net:body", "id", v.Id, "rid", rid, "error", ex.Message); }
    }

    // ---------------- Localhost: verificação de portas cadastradas ----------------

    async void Probe(List<int> ports, string req)
    {
        var res = new Dictionary<string, object>();
        var tasks = ports.Select(async p => { res[p.ToString()] = await IsPortOpen(p); }).ToArray();
        try { await Task.WhenAll(tasks); } catch { }
        Post("probe:result", "req", req, "results", res);
    }

    static async Task<bool> IsPortOpen(int port)
    {
        var r = await Task.WhenAll(TryConnect(IPAddress.Loopback, port), TryConnect(IPAddress.IPv6Loopback, port));
        return r[0] || r[1];
    }

    static async Task<bool> TryConnect(IPAddress ip, int port)
    {
        var c = new TcpClient(ip.AddressFamily);
        try
        {
            var t = c.ConnectAsync(ip, port);
            if (await Task.WhenAny(t, Task.Delay(700)) != t) return false;
            await t;
            return c.Connected;
        }
        catch { return false; }
        finally { c.Close(); }
    }

    // ---------------- Outros ----------------

    async void Screenshot(View t)
    {
        if (t.Core == null) return;
        try
        {
            Directory.CreateDirectory(ShotsDir);
            string file = Path.Combine(ShotsDir, "TSF-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png");
            using (var fs = File.Create(file))
                await t.Core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
            Post("shot", "file", file);
        }
        catch (Exception ex) { Toast("Não foi possível salvar a captura: " + ex.Message); }
    }

    async void ClearWorkspaceData(string ws)
    {
        if (string.IsNullOrEmpty(ws) || env == null) return;
        WebView2 temp = null;
        try
        {
            CoreWebView2Profile profile = null;
            foreach (var t in views.Values)
                if (t.Ws == ws && t.Core != null) { profile = t.Core.Profile; break; }
            if (profile == null)
            {
                temp = new WebView2 { Visible = false, Size = new Size(1, 1) };
                Controls.Add(temp);
                var h = temp.Handle;
                var opts = env.CreateCoreWebView2ControllerOptions();
                opts.ProfileName = ProfileFor(ws);
                await temp.EnsureCoreWebView2Async(env, opts);
                profile = temp.CoreWebView2.Profile;
            }
            await profile.ClearBrowsingDataAsync();
            Toast("Cookies, cache e armazenamento do workspace foram apagados.");
        }
        catch (Exception ex) { Toast("Falha ao limpar dados: " + ex.Message); }
        finally
        {
            if (temp != null) { Controls.Remove(temp); temp.Dispose(); }
        }
    }

    // ---------------- Janela ----------------

    void ToggleMaximize()
    {
        if (fullScreen) return;
        WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
    }

    void SetFullScreen(View t, bool on)
    {
        if (on == fullScreen) return;
        if (on)
        {
            fsPrevState = WindowState;
            fsPrevBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            fullScreen = true;
            fsId = t.Id;
            WindowState = FormWindowState.Normal;
            Padding = Padding.Empty;
            Bounds = Screen.FromControl(this).Bounds;
        }
        else
        {
            fullScreen = false;
            Bounds = fsPrevBounds;
            WindowState = fsPrevState;
            UpdatePadding();
        }
        UpdateVisibility();
        Post("win", "maximized", WindowState == FormWindowState.Maximized, "fullscreen", fullScreen);
    }

    void UpdatePadding()
    {
        if (fullScreen) return;
        var p = WindowState == FormWindowState.Maximized ? Padding.Empty : new Padding(border);
        if (Padding != p) Padding = p;
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        UpdatePadding();
        if (fullScreen) UpdateVisibility();
        Post("win", "maximized", WindowState == FormWindowState.Maximized, "fullscreen", fullScreen);
    }

    protected override void WndProc(ref Message m)
    {
        const int WM_NCHITTEST = 0x84, WM_GETMINMAXINFO = 0x24;
        if (m.Msg == WM_GETMINMAXINFO && !fullScreen)
        {
            base.WndProc(ref m);
            try
            {
                var scr = Screen.FromHandle(Handle);
                var wa = scr.WorkingArea; var b = scr.Bounds;
                var mmi = (MINMAXINFO)Marshal.PtrToStructure(m.LParam, typeof(MINMAXINFO));
                mmi.maxPosition.x = wa.X - b.X; mmi.maxPosition.y = wa.Y - b.Y;
                mmi.maxSize.x = wa.Width; mmi.maxSize.y = wa.Height;
                Marshal.StructureToPtr(mmi, m.LParam, true);
            }
            catch { }
            return;
        }
        if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal && !fullScreen)
        {
            long lp = m.LParam.ToInt64();
            var pt = PointToClient(new Point((short)(lp & 0xFFFF), (short)((lp >> 16) & 0xFFFF)));
            int g = border + S(2);
            bool l = pt.X < g, r = pt.X >= ClientSize.Width - g, tp = pt.Y < g, bt = pt.Y >= ClientSize.Height - g;
            int hit = 0;
            if (tp && l) hit = 13; else if (tp && r) hit = 14; else if (bt && l) hit = 16; else if (bt && r) hit = 17;
            else if (l) hit = 10; else if (r) hit = 11; else if (tp) hit = 12; else if (bt) hit = 15;
            if (hit != 0) { m.Result = (IntPtr)hit; return; }
        }
        base.WndProc(ref m);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!closeAllowed && shellReady)
        {
            // Pede ao shell para gravar o estado antes de fechar (com limite de tempo).
            e.Cancel = true;
            Post("flush");
            var timer = new Timer { Interval = 1200 };
            timer.Tick += (s, a) => { timer.Stop(); timer.Dispose(); closeAllowed = true; Close(); };
            timer.Start();
            return;
        }
        base.OnFormClosing(e);
    }

    // ---------------- Teclado e foco ----------------

    static string Combo(Keys kd)
    {
        Keys code = kd & Keys.KeyCode;
        string name = null;
        if (code >= Keys.A && code <= Keys.Z) name = code.ToString().ToLowerInvariant();
        else if (code >= Keys.D0 && code <= Keys.D9) name = ((int)(code - Keys.D0)).ToString();
        else if (code >= Keys.NumPad0 && code <= Keys.NumPad9) name = ((int)(code - Keys.NumPad0)).ToString();
        else if (code >= Keys.F1 && code <= Keys.F24) name = "f" + ((int)(code - Keys.F1) + 1);
        else
            switch (code)
            {
                case Keys.Tab: name = "tab"; break;
                case Keys.PageUp: name = "pageup"; break;
                case Keys.PageDown: name = "pagedown"; break;
                case Keys.Left: name = "left"; break;
                case Keys.Right: name = "right"; break;
                case Keys.Oemplus: case Keys.Add: name = "plus"; break;
                case Keys.OemMinus: case Keys.Subtract: name = "minus"; break;
                case Keys.Oemcomma: name = "comma"; break;
                case Keys.Home: name = "home"; break;
            }
        if (name == null) return null;
        var sb = new StringBuilder();
        if ((kd & Keys.Control) != 0) sb.Append("ctrl+");
        if ((kd & Keys.Shift) != 0) sb.Append("shift+");
        if ((kd & Keys.Alt) != 0) sb.Append("alt+");
        return sb.Append(name).ToString();
    }

    // O controle WinForms não repassa todos os atalhos ao formulário; assinamos o evento do controller.
    void HookController(WebView2 wv, string viewId)
    {
        try
        {
            var f = typeof(WebView2).GetField("_coreWebView2Controller", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var ctl = f == null ? null : f.GetValue(wv) as CoreWebView2Controller;
            if (ctl == null) return;
            ctl.AcceleratorKeyPressed += (s, e) =>
            {
                if (e.Handled) return;
                if (e.KeyEventKind != CoreWebView2KeyEventKind.KeyDown && e.KeyEventKind != CoreWebView2KeyEventKind.SystemKeyDown) return;
                string combo = Combo((Keys)e.VirtualKey | ModifierKeys);
                if (combo != null && shellReady && keys.Contains(combo))
                {
                    e.Handled = true;
                    Post("key", "combo", combo);
                }
            };
            if (viewId != null) ctl.GotFocus += (s, e) => Post("view:focus", "id", viewId);
        }
        catch { }
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        string combo = Combo(keyData);
        if (combo != null && shellReady && keys.Contains(combo)) { Post("key", "combo", combo); return true; }
        return base.ProcessCmdKey(ref msg, keyData);
    }

    // ---------------- Arquivos ----------------

    static string ReadText(string file)
    {
        try { return File.Exists(file) ? File.ReadAllText(file, Encoding.UTF8) : null; } catch { return null; }
    }

    static void WriteText(string file, string text)
    {
        try
        {
            string tmp = file + ".tmp";
            File.WriteAllText(tmp, text, new UTF8Encoding(false));
            if (File.Exists(file)) File.Replace(tmp, file, null);
            else File.Move(tmp, file);
        }
        catch { }
    }
}
