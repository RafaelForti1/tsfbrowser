// Meu Navegador - navegador pessoal baseado no WebView2 (motor Chromium do Edge)
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class TabInfo
{
    public TabPage Page;
    public WebView2 Wv;
    public Task Ready;
    public bool Loading;
    public CoreWebView2 Core { get { return Wv.CoreWebView2; } }
}

class Navegador : Form
{
    static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MeuNavegador");
    static readonly string FavFile = Path.Combine(DataDir, "favoritos.txt");
    static readonly string HistFile = Path.Combine(DataDir, "historico.txt");
    static readonly string HomeFile = Path.Combine(DataDir, "inicial.txt");
    const string DefaultHome = "https://www.google.com";
    const string SearchUrl = "https://www.google.com/search?q=";
    const string AppName = "Meu Navegador";

    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);

    Task<CoreWebView2Environment> envTask;
    TabControl tabs;
    Panel nav;
    TextBox address;
    Button btnBack, btnFwd, btnReload, btnHome, btnNewTab, btnStar, btnMenu;
    ToolStrip favBar;
    ContextMenuStrip menu;
    ToolTip tip = new ToolTip();
    List<string[]> favs = new List<string[]>();
    string homeUrl = DefaultHome;
    string[] startArgs;
    float k = 1f;
    bool fullScreen, favBarWasVisible;
    FormWindowState prevState;

    int S(int v) { return (int)Math.Round(v * k); }

    [STAThread]
    static void Main(string[] args)
    {
        try { SetProcessDPIAware(); } catch { }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Navegador(args));
    }

    public Navegador(string[] args)
    {
        startArgs = args;
        Directory.CreateDirectory(DataDir);
        using (var g = CreateGraphics()) k = g.DpiX / 96f;
        if (File.Exists(HomeFile)) { var h = File.ReadAllText(HomeFile).Trim(); if (h != "") homeUrl = h; }

        Text = AppName;
        Font = new Font("Segoe UI", 9.5f);
        Size = new Size(S(1280), S(820));
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(240, 240, 244);

        // Abas (adicionadas primeiro para ocupar o espaço restante)
        tabs = new TabControl
        {
            Dock = DockStyle.Fill,
            DrawMode = TabDrawMode.OwnerDrawFixed,
            SizeMode = TabSizeMode.Fixed,
            ItemSize = new Size(S(210), S(28))
        };
        tabs.DrawItem += DrawTab;
        tabs.MouseDown += TabsMouseDown;
        tabs.SelectedIndexChanged += (s, e) => UpdateUi();
        Controls.Add(tabs);

        // Barra de favoritos
        favBar = new ToolStrip { Dock = DockStyle.Top, GripStyle = ToolStripGripStyle.Hidden, RenderMode = ToolStripRenderMode.System, Padding = new Padding(S(6), 0, 0, 0) };
        Controls.Add(favBar);

        // Barra de navegação
        nav = new Panel { Dock = DockStyle.Top, Height = S(42), Padding = new Padding(S(4)) };
        var addrHost = new Panel { Dock = DockStyle.Fill, Padding = new Padding(S(6), S(3), S(6), 0) };
        address = new TextBox { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 11f), BorderStyle = BorderStyle.FixedSingle };
        address.KeyDown += AddressKeyDown;
        address.Enter += (s, e) => BeginInvoke(new Action(address.SelectAll));
        address.MouseUp += (s, e) => { if (address.SelectionLength == 0 && address.Tag == null) { address.SelectAll(); address.Tag = 1; } };
        address.Leave += (s, e) => address.Tag = null;
        addrHost.Controls.Add(address);
        nav.Controls.Add(addrHost);

        btnBack = Btn("←", "Voltar (Alt+←)", (s, e) => Back());
        btnFwd = Btn("→", "Avançar (Alt+→)", (s, e) => Fwd());
        btnReload = Btn("↻", "Recarregar (F5)", (s, e) => ReloadOrStop());
        btnHome = Btn("⌂", "Página inicial (Alt+Home)", (s, e) => GoHome());
        btnNewTab = Btn("+", "Nova aba (Ctrl+T)", (s, e) => NewTab());
        btnStar = Btn("☆", "Adicionar/remover favorito (Ctrl+D)", (s, e) => ToggleFav());
        btnMenu = Btn("≡", "Menu", (s, e) => menu.Show(btnMenu, new Point(btnMenu.Width, btnMenu.Height), ToolStripDropDownDirection.BelowLeft));
        // Ordem de docking: o último adicionado fica na borda
        foreach (var b in new[] { btnNewTab, btnHome, btnReload, btnFwd, btnBack }) { b.Dock = DockStyle.Left; nav.Controls.Add(b); }
        foreach (var b in new[] { btnStar, btnMenu }) { b.Dock = DockStyle.Right; nav.Controls.Add(b); }
        Controls.Add(nav);

        BuildMenu();
        LoadFavs();
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        SendMessage(address.Handle, 0x1501, (IntPtr)1, "Pesquise no Google ou digite um endereço");
        string first = startArgs.Length > 0 ? ToUrl(string.Join(" ", startArgs)) : homeUrl;
        AddTab(first, true);
    }

    Button Btn(string txt, string tipText, EventHandler click)
    {
        var b = new Button { Text = txt, Width = S(38), FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI Symbol", 12f), TabStop = false };
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(218, 218, 226);
        tip.SetToolTip(b, tipText);
        b.Click += click;
        return b;
    }

    ToolStripMenuItem Mi(string text, string keys, Action act)
    {
        var mi = new ToolStripMenuItem(text);
        if (keys != null) mi.ShortcutKeyDisplayString = keys;
        mi.Click += (s, e) => act();
        return mi;
    }

    void BuildMenu()
    {
        menu = new ContextMenuStrip();
        menu.Items.Add(Mi("Nova aba", "Ctrl+T", NewTab));
        menu.Items.Add(Mi("Fechar aba", "Ctrl+W", () => { if (Cur != null) CloseTab(Cur.Page); }));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Mi("Histórico", "Ctrl+H", ShowHistory));
        menu.Items.Add(Mi("Favoritos", null, ShowFavs));
        menu.Items.Add(Mi("Mostrar/ocultar barra de favoritos", "Ctrl+Shift+B", () => favBar.Visible = !favBar.Visible));
        menu.Items.Add(Mi("Downloads", "Ctrl+J", OpenDownloads));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Mi("Aumentar zoom", "Ctrl++", () => Zoom(0.1)));
        menu.Items.Add(Mi("Diminuir zoom", "Ctrl+-", () => Zoom(-0.1)));
        menu.Items.Add(Mi("Zoom 100%", "Ctrl+0", () => { if (Cur != null) Cur.Wv.ZoomFactor = 1.0; }));
        menu.Items.Add(Mi("Imprimir...", "Ctrl+P", () => { if (Cur != null && Cur.Core != null) Cur.Core.ShowPrintUI(); }));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Mi("Usar esta página como inicial", null, SetHome));
        menu.Items.Add(Mi("Limpar dados de navegação...", null, ClearData));
        menu.Items.Add(Mi("Ferramentas do desenvolvedor", "F12", DevTools));
    }

    // ---------- Abas ----------

    TabInfo Cur { get { return tabs.SelectedTab == null ? null : (TabInfo)tabs.SelectedTab.Tag; } }

    void NewTab() { AddTab(homeUrl, true); FocusAddress(); }

    TabInfo AddTab(string url, bool select)
    {
        var page = new TabPage("Nova aba");
        var wv = new WebView2 { Dock = DockStyle.Fill };
        page.Controls.Add(wv);
        var info = new TabInfo { Page = page, Wv = wv };
        page.Tag = info;
        tabs.TabPages.Add(page);
        if (select) tabs.SelectedTab = page;
        info.Ready = InitTab(info, url);
        return info;
    }

    async Task InitTab(TabInfo info, string url)
    {
        try
        {
            if (envTask == null) envTask = CoreWebView2Environment.CreateAsync(null, DataDir);
            var env = await envTask;
            await info.Wv.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            if (!info.Wv.IsDisposed) MessageBox.Show(this, "Não foi possível iniciar o motor do navegador:\n" + ex.Message, AppName);
            return;
        }
        var core = info.Core;
        var page = info.Page;
        core.DocumentTitleChanged += (s, e) => { page.Text = core.DocumentTitle; tabs.Invalidate(); if (info == Cur) UpdateUi(); };
        core.SourceChanged += (s, e) => { if (info == Cur) UpdateUi(); };
        core.HistoryChanged += (s, e) => { if (info == Cur) UpdateUi(); };
        core.NavigationStarting += (s, e) => { info.Loading = true; if (info == Cur) UpdateUi(); };
        core.NavigationCompleted += (s, e) =>
        {
            info.Loading = false;
            if (info == Cur) UpdateUi();
            if (e.IsSuccess) AddHistory(core.DocumentTitle, core.Source);
        };
        core.NewWindowRequested += async (s, e) =>
        {
            var d = e.GetDeferral();
            try
            {
                var t = AddTab(null, true);
                await t.Ready;
                if (t.Core != null) { e.NewWindow = t.Core; e.Handled = true; }
            }
            catch { }
            finally { d.Complete(); }
        };
        core.WindowCloseRequested += (s, e) => BeginInvoke(new Action(() => CloseTab(page)));
        core.ContainsFullScreenElementChanged += (s, e) => SetFullScreen(info, core.ContainsFullScreenElement);
        core.AcceleratorKeyPressed += (s, e) =>
        {
            if (e.KeyEventKind != CoreWebView2KeyEventKind.KeyDown && e.KeyEventKind != CoreWebView2KeyEventKind.SystemKeyDown) return;
            if (Shortcut((Keys)e.VirtualKey | ModifierKeys)) e.Handled = true;
        };
        if (url != null) { try { core.Navigate(url); } catch { } }
        if (info == Cur) UpdateUi();
    }

    void CloseTab(TabPage p)
    {
        int i = tabs.TabPages.IndexOf(p);
        if (i < 0) return;
        var info = (TabInfo)p.Tag;
        if (fullScreen) SetFullScreen(info, false);
        if (tabs.SelectedTab == p && tabs.TabCount > 1) tabs.SelectedIndex = (i == tabs.TabCount - 1) ? i - 1 : i + 1;
        tabs.TabPages.Remove(p);
        info.Wv.Dispose();
        p.Dispose();
        if (tabs.TabCount == 0) Close();
    }

    void Cycle(int d)
    {
        int n = tabs.TabCount;
        if (n > 1) tabs.SelectedIndex = (tabs.SelectedIndex + d + n) % n;
    }

    Rectangle CloseRect(Rectangle r) { return new Rectangle(r.Right - S(24), r.Y + S(4), S(20), r.Height - S(8)); }

    void DrawTab(object s, DrawItemEventArgs e)
    {
        var r = tabs.GetTabRect(e.Index);
        var p = tabs.TabPages[e.Index];
        bool sel = e.Index == tabs.SelectedIndex;
        var info = p.Tag as TabInfo;
        using (var b = new SolidBrush(sel ? Color.White : Color.FromArgb(226, 226, 232))) e.Graphics.FillRectangle(b, r);
        string title = (info != null && info.Loading ? "◌ " : "") + p.Text;
        var tr = new Rectangle(r.X + S(8), r.Y, r.Width - S(34), r.Height);
        TextRenderer.DrawText(e.Graphics, title, Font, tr, Color.FromArgb(30, 30, 30),
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine);
        TextRenderer.DrawText(e.Graphics, "×", new Font("Segoe UI", 11f), CloseRect(r), Color.Gray,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
    }

    void TabsMouseDown(object s, MouseEventArgs e)
    {
        for (int i = 0; i < tabs.TabCount; i++)
        {
            var r = tabs.GetTabRect(i);
            if (!r.Contains(e.Location)) continue;
            if (e.Button == MouseButtons.Middle || (e.Button == MouseButtons.Left && CloseRect(r).Contains(e.Location)))
                CloseTab(tabs.TabPages[i]);
            return;
        }
    }

    void SetFullScreen(TabInfo t, bool on)
    {
        if (on == fullScreen) return;
        fullScreen = on;
        SuspendLayout();
        if (on)
        {
            prevState = WindowState;
            favBarWasVisible = favBar.Visible;
            t.Page.Controls.Remove(t.Wv);
            Controls.Add(t.Wv);
            nav.Visible = false; favBar.Visible = false; tabs.Visible = false;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            Controls.Remove(t.Wv);
            t.Page.Controls.Add(t.Wv);
            nav.Visible = true; favBar.Visible = favBarWasVisible; tabs.Visible = true;
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = prevState;
        }
        ResumeLayout();
    }

    // ---------- Navegação ----------

    void UpdateUi()
    {
        tabs.Invalidate();
        var t = Cur;
        if (t == null || t.Core == null)
        {
            btnBack.Enabled = btnFwd.Enabled = false;
            if (!address.Focused) address.Text = "";
            Text = AppName;
            return;
        }
        var c = t.Core;
        string src = c.Source ?? "";
        if (!address.Focused) address.Text = src == "about:blank" ? "" : src;
        btnBack.Enabled = c.CanGoBack;
        btnFwd.Enabled = c.CanGoForward;
        btnReload.Text = t.Loading ? "✕" : "↻";
        tip.SetToolTip(btnReload, t.Loading ? "Parar (Esc)" : "Recarregar (F5)");
        btnStar.Text = FindFav(src) >= 0 ? "★" : "☆";
        btnStar.ForeColor = FindFav(src) >= 0 ? Color.DarkGoldenrod : SystemColors.ControlText;
        Text = (string.IsNullOrEmpty(c.DocumentTitle) ? "" : c.DocumentTitle + " - ") + AppName;
    }

    static string ToUrl(string text)
    {
        text = text.Trim();
        if (text.Contains("://") || text.StartsWith("about:") || text.StartsWith("edge:") || text.StartsWith("file:")) return text;
        if (text.StartsWith("localhost") || text.StartsWith("127.0.0.1")) return "http://" + text;
        if (!text.Contains(" ") && text.Contains(".") && !text.EndsWith(".")) return "https://" + text;
        return SearchUrl + Uri.EscapeDataString(text);
    }

    void OpenUrl(string url, bool newTab)
    {
        var t = Cur;
        if (newTab || t == null) { AddTab(url, true); return; }
        Navigate(t, url);
    }

    async void Navigate(TabInfo t, string url)
    {
        await t.Ready;
        if (t.Core == null) return;
        try { t.Core.Navigate(url); t.Wv.Focus(); }
        catch (Exception ex) { MessageBox.Show(this, "Endereço inválido: " + ex.Message, AppName); }
    }

    void AddressKeyDown(object s, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            e.SuppressKeyPress = true;
            if (address.Text.Trim() == "") return;
            OpenUrl(ToUrl(address.Text), e.Alt);
        }
        else if (e.KeyCode == Keys.Escape)
        {
            e.SuppressKeyPress = true;
            if (Cur != null) Cur.Wv.Focus();
            UpdateUi();
        }
    }

    void FocusAddress() { address.Focus(); address.SelectAll(); }
    void Back() { var t = Cur; if (t != null && t.Core != null && t.Core.CanGoBack) t.Core.GoBack(); }
    void Fwd() { var t = Cur; if (t != null && t.Core != null && t.Core.CanGoForward) t.Core.GoForward(); }
    void GoHome() { OpenUrl(homeUrl, false); }
    void ReloadOrStop()
    {
        var t = Cur; if (t == null || t.Core == null) return;
        if (t.Loading) t.Core.Stop(); else t.Core.Reload();
    }
    void Zoom(double d) { var t = Cur; if (t != null) t.Wv.ZoomFactor = Math.Max(0.25, Math.Min(5.0, t.Wv.ZoomFactor + d)); }
    void DevTools() { var t = Cur; if (t != null && t.Core != null) t.Core.OpenDevToolsWindow(); }
    void OpenDownloads() { var t = Cur; if (t != null && t.Core != null) t.Core.OpenDefaultDownloadDialog(); }

    void SetHome()
    {
        var t = Cur; if (t == null || t.Core == null) return;
        homeUrl = t.Core.Source;
        File.WriteAllText(HomeFile, homeUrl, Encoding.UTF8);
        MessageBox.Show(this, "Página inicial definida:\n" + homeUrl, AppName);
    }

    async void ClearData()
    {
        if (MessageBox.Show(this, "Apagar histórico, cookies, cache e logins salvos?\n(Favoritos são mantidos.)", AppName,
            MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        try { File.Delete(HistFile); } catch { }
        var t = Cur;
        if (t != null && t.Core != null) await t.Core.Profile.ClearBrowsingDataAsync();
        MessageBox.Show(this, "Dados apagados.", AppName);
    }

    bool Shortcut(Keys k)
    {
        switch (k)
        {
            case Keys.Control | Keys.T: NewTab(); return true;
            case Keys.Control | Keys.W: if (Cur != null) CloseTab(Cur.Page); return true;
            case Keys.Control | Keys.L: case Keys.Alt | Keys.D: case Keys.F6: FocusAddress(); return true;
            case Keys.Control | Keys.Tab: case Keys.Control | Keys.PageDown: Cycle(1); return true;
            case Keys.Control | Keys.Shift | Keys.Tab: case Keys.Control | Keys.PageUp: Cycle(-1); return true;
            case Keys.Control | Keys.D: ToggleFav(); return true;
            case Keys.Control | Keys.H: ShowHistory(); return true;
            case Keys.Control | Keys.J: OpenDownloads(); return true;
            case Keys.Control | Keys.Shift | Keys.B: favBar.Visible = !favBar.Visible; return true;
            case Keys.F5: case Keys.Control | Keys.R: if (Cur != null && Cur.Core != null) Cur.Core.Reload(); return true;
            case Keys.Alt | Keys.Left: Back(); return true;
            case Keys.Alt | Keys.Right: Fwd(); return true;
            case Keys.Alt | Keys.Home: GoHome(); return true;
            case Keys.F12: DevTools(); return true;
        }
        return false;
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (Shortcut(keyData)) return true;
        return base.ProcessCmdKey(ref msg, keyData);
    }

    // ---------- Favoritos e histórico ----------

    static string Clean(string s) { return (s ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ').Trim(); }
    static string Trunc(string s, int n) { return s.Length <= n ? s : s.Substring(0, n - 1) + "…"; }

    static List<string[]> ReadTsv(string file)
    {
        var list = new List<string[]>();
        try
        {
            if (File.Exists(file))
                foreach (var line in File.ReadAllLines(file, Encoding.UTF8))
                {
                    var p = line.Split('\t');
                    if (p.Length >= 2) list.Add(p);
                }
        }
        catch { }
        return list;
    }

    void LoadFavs() { favs = ReadTsv(FavFile); RebuildFavBar(); }

    void SaveFavs()
    {
        File.WriteAllLines(FavFile, favs.Select(f => f[0] + "\t" + f[1]), Encoding.UTF8);
        RebuildFavBar();
        UpdateUi();
    }

    int FindFav(string url) { return favs.FindIndex(f => f[1] == url); }

    void ToggleFav()
    {
        var t = Cur; if (t == null || t.Core == null) return;
        string url = t.Core.Source;
        if (string.IsNullOrEmpty(url) || url == "about:blank") return;
        int i = FindFav(url);
        if (i >= 0) favs.RemoveAt(i);
        else
        {
            string title = Clean(t.Core.DocumentTitle);
            favs.Add(new[] { title == "" ? url : title, url });
        }
        SaveFavs();
    }

    void RebuildFavBar()
    {
        favBar.Items.Clear();
        if (favs.Count == 0)
        {
            favBar.Items.Add(new ToolStripLabel("Clique em ☆ ou pressione Ctrl+D para adicionar favoritos aqui") { ForeColor = Color.Gray });
            return;
        }
        foreach (var f in favs)
        {
            var fav = f;
            var b = new ToolStripButton(Trunc(fav[0], 26)) { ToolTipText = fav[0] + "\n" + fav[1] };
            b.Click += (s, e) => OpenUrl(fav[1], (ModifierKeys & Keys.Control) != 0);
            var cm = new ContextMenuStrip();
            cm.Items.Add("Abrir em nova aba", null, (s, e) => OpenUrl(fav[1], true));
            cm.Items.Add("Remover", null, (s, e) => { favs.Remove(fav); BeginInvoke(new Action(SaveFavs)); });
            b.MouseUp += (s, e) =>
            {
                if (e.Button == MouseButtons.Middle) OpenUrl(fav[1], true);
                else if (e.Button == MouseButtons.Right) cm.Show(Cursor.Position);
            };
            favBar.Items.Add(b);
        }
    }

    void AddHistory(string title, string url)
    {
        if (string.IsNullOrEmpty(url) || url.StartsWith("about:")) return;
        try { File.AppendAllText(HistFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm") + "\t" + Clean(title) + "\t" + url + "\r\n", Encoding.UTF8); }
        catch { }
    }

    void ShowHistory()
    {
        var items = ReadTsv(HistFile).Where(x => x.Length >= 3).ToList();
        items.Reverse();
        new ListaForm("Histórico", new[] { "Data", "Título", "Endereço" }, new[] { 130, 380, 420 }, items, k,
            url => OpenUrl(url, true),
            list =>
            {
                var copy = list.ToList(); copy.Reverse();
                File.WriteAllLines(HistFile, copy.Select(x => string.Join("\t", x)), Encoding.UTF8);
            }).Show(this);
    }

    void ShowFavs()
    {
        new ListaForm("Favoritos", new[] { "Título", "Endereço" }, new[] { 380, 500 }, favs, k,
            url => OpenUrl(url, true),
            list => SaveFavs()).Show(this);
    }
}

class ListaForm : Form
{
    ListView lv;
    TextBox filtro;
    List<string[]> items;
    Action<string> abrir;
    Action<List<string[]>> salvar;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);

    public ListaForm(string titulo, string[] cols, int[] widths, List<string[]> items, float k, Action<string> abrir, Action<List<string[]>> salvar)
    {
        this.items = items; this.abrir = abrir; this.salvar = salvar;
        Text = titulo;
        Font = new Font("Segoe UI", 9.5f);
        Size = new Size((int)(960 * k), (int)(600 * k));
        StartPosition = FormStartPosition.CenterParent;
        ShowInTaskbar = false;

        lv = new ListView { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, HideSelection = false };
        for (int i = 0; i < cols.Length; i++) lv.Columns.Add(cols[i], (int)(widths[i] * k));
        lv.DoubleClick += (s, e) => OpenSelected();
        lv.KeyDown += (s, e) =>
        {
            if (e.KeyCode == Keys.Delete) RemoveSelected();
            else if (e.KeyCode == Keys.Enter) OpenSelected();
        };
        Controls.Add(lv);

        filtro = new TextBox { Dock = DockStyle.Top, Font = new Font("Segoe UI", 11f) };
        filtro.TextChanged += (s, e) => Fill();
        Controls.Add(filtro);

        var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = (int)(40 * k), FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(4) };
        var bClear = new Button { Text = "Apagar tudo", AutoSize = true };
        bClear.Click += (s, e) =>
        {
            if (MessageBox.Show(this, "Apagar todos os itens?", Text, MessageBoxButtons.YesNo) != DialogResult.Yes) return;
            this.items.Clear(); this.salvar(this.items); Fill();
        };
        var bRemove = new Button { Text = "Remover selecionados (Del)", AutoSize = true };
        bRemove.Click += (s, e) => RemoveSelected();
        var bOpen = new Button { Text = "Abrir", AutoSize = true };
        bOpen.Click += (s, e) => OpenSelected();
        bottom.Controls.AddRange(new Control[] { bClear, bRemove, bOpen });
        Controls.Add(bottom);

        Load += (s, e) => { SendMessage(filtro.Handle, 0x1501, (IntPtr)1, "Filtrar..."); filtro.Focus(); };
        Fill();
    }

    void Fill()
    {
        string f = filtro.Text.Trim().ToLowerInvariant();
        lv.BeginUpdate();
        lv.Items.Clear();
        int n = 0;
        foreach (var it in items)
        {
            if (f != "" && !string.Join(" ", it).ToLowerInvariant().Contains(f)) continue;
            lv.Items.Add(new ListViewItem(it) { Tag = it });
            if (++n >= 3000) break;
        }
        lv.EndUpdate();
    }

    void OpenSelected()
    {
        foreach (ListViewItem li in lv.SelectedItems) { var it = (string[])li.Tag; abrir(it[it.Length - 1]); }
    }

    void RemoveSelected()
    {
        if (lv.SelectedItems.Count == 0) return;
        foreach (ListViewItem li in lv.SelectedItems) items.Remove((string[])li.Tag);
        salvar(items);
        Fill();
    }
}
