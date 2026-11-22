using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace FoolmoonSetup
{
    public sealed class SetupApp : Application
    {
        [STAThread]
        public static int Main(string[] args)
        {
            foreach (string arg in args)
            {
                if (string.Equals(arg, "--version", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("Foolmoon Setup 1.0.0");
                    return 0;
                }
                if (string.Equals(arg, "--self-test", StringComparison.OrdinalIgnoreCase))
                {
                    return RunSelfTest();
                }
            }

            ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; // TLS 1.2
            var app = new SetupApp();
            var win = new SetupWindow();
            return app.Run(win);
        }

        private static int RunSelfTest()
        {
            string script = ExtractBootstrapScriptPreview();
            if (string.IsNullOrWhiteSpace(script) || !script.Contains("Emit-Stage"))
            {
                Console.Error.WriteLine("Embedded bootstrap-foolmoon.ps1 resource is missing or invalid.");
                return 2;
            }
            Console.WriteLine("SELF_TEST_OK: embedded bootstrap-foolmoon.ps1 verified (" + script.Length + " chars).");
            return 0;
        }

        internal static string ExtractBootstrapScriptPreview()
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream("bootstrap-foolmoon.ps1"))
            {
                if (s == null) return string.Empty;
                using (var reader = new StreamReader(s, Encoding.UTF8))
                {
                    return reader.ReadToEnd();
                }
            }
        }
    }

    public sealed class SetupWindow : Window
    {
        // Claude-inspired warm obsidian & terracotta editorial palette
        private static readonly Color C_Bg = (Color)ColorConverter.ConvertFromString("#141312");
        private static readonly Color C_Card = (Color)ColorConverter.ConvertFromString("#1C1A18");
        private static readonly Color C_Surface = (Color)ColorConverter.ConvertFromString("#25221F");
        private static readonly Color C_Border = (Color)ColorConverter.ConvertFromString("#35302B");
        private static readonly Color C_Text = (Color)ColorConverter.ConvertFromString("#F4EFE6");
        private static readonly Color C_Muted = (Color)ColorConverter.ConvertFromString("#A89F91");
        private static readonly Color C_Accent = (Color)ColorConverter.ConvertFromString("#D97757");
        private static readonly Color C_AccentHover = (Color)ColorConverter.ConvertFromString("#E48869");
        private static readonly Color C_Success = (Color)ColorConverter.ConvertFromString("#34D399");
        private static readonly Color C_Error = (Color)ColorConverter.ConvertFromString("#F87171");

        private static Brush B(Color c) { var b = new SolidColorBrush(c); b.Freeze(); return b; }

        private int _step = 0;
        private bool _installing = false;
        private bool _installDone = false;

        private readonly Border[] _stepPills = new Border[4];
        private readonly TextBlock[] _stepPillLabels = new TextBlock[4];
        private readonly Grid _contentHost = new Grid();
        private readonly FrameworkElement[] _pages = new FrameworkElement[4];
        private readonly Button _btnBack;
        private readonly Button _btnNext;

        // Step 1 controls
        private readonly TextBox _tbInstallDir;
        private readonly CheckBox _cbDesktopShortcut;
        private readonly CheckBox _cbStartMenuShortcut;
        private readonly TextBlock _lblHardwareBadge;

        // Step 2 controls (Memory / Address / Persona)
        private readonly TextBox _tbName;
        private readonly TextBox _tbAddressAs;
        private readonly ComboBox _cbLanguage;
        private readonly ComboBox _cbStyle;
        private readonly TextBox _tbRole;
        private readonly TextBox _tbRules;
        private readonly ComboBox _cbSkin;

        // Step 3 controls (LM Studio / Custom API)
        private readonly TextBox _tbLmUrl;
        private readonly TextBlock _lblLmStatus;
        private readonly ListBox _lbModels;
        private readonly TextBox _tbManualModel;
        private readonly RadioButton _rbUseLmStudio;
        private readonly RadioButton _rbUseCustomApi;
        private readonly StackPanel _customApiBox;
        private readonly TextBox _tbCustomBaseUrl;
        private readonly TextBox _tbCustomModel;
        private readonly PasswordBox _pbCustomApiKey;

        // Step 4 controls (Progress & Logs)
        private readonly ProgressBar _progressBar;
        private readonly TextBlock _lblPercent;
        private readonly TextBlock _lblCurrentStageMsg;
        private readonly Dictionary<string, TextBlock> _stageBadges = new Dictionary<string, TextBlock>();
        private readonly TextBox _tbInstallLog;

        public SetupWindow()
        {
            Title = "Foolmoon Kurulum Sihirbazı";
            Width = 860;
            Height = 640;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI");

            var rootBorder = new Border
            {
                Background = B(C_Bg),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(18),
                ClipToBounds = true
            };

            var rootGrid = new Grid();
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(60) });
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(46) });
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(72) });

            // Top bar (draggable)
            var topBar = new Grid { Background = B(C_Card) };
            topBar.MouseLeftButtonDown += (s, e) => { if (e.LeftButton == MouseButtonState.Pressed) DragMove(); };

            var brandStack = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(24, 0, 0, 0)
            };
            var logoDot = new Ellipse
            {
                Width = 14,
                Height = 14,
                Fill = B(C_Accent),
                Margin = new Thickness(0, 0, 12, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
            var brandText = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            brandText.Children.Add(new TextBlock
            {
                Text = "Foolmoon",
                Foreground = B(C_Text),
                FontSize = 15,
                FontWeight = FontWeights.SemiBold
            });
            brandText.Children.Add(new TextBlock
            {
                Text = "Hermes Agent Desktop Kurulumu · v1.0.0",
                Foreground = B(C_Muted),
                FontSize = 11
            });
            brandStack.Children.Add(logoDot);
            brandStack.Children.Add(brandText);
            topBar.Children.Add(brandStack);

            var winControls = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 16, 0)
            };
            var btnMin = MakeGhostButton("—");
            btnMin.Click += (s, e) => WindowState = WindowState.Minimized;
            var btnClose = MakeGhostButton("✕");
            btnClose.Click += (s, e) => { if (!_installing) Close(); };
            winControls.Children.Add(btnMin);
            winControls.Children.Add(btnClose);
            topBar.Children.Add(winControls);
            Grid.SetRow(topBar, 0);
            rootGrid.Children.Add(topBar);

            // Step indicator bar
            var stepStrip = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            string[] titles = { "1. Hoş Geldin", "2. Seni Tanıyalım", "3. LM Studio & Model", "4. Kurulum" };
            for (int i = 0; i < 4; i++)
            {
                var pillText = new TextBlock
                {
                    Text = titles[i],
                    Foreground = B(C_Muted),
                    FontSize = 12,
                    FontWeight = FontWeights.Medium
                };
                var pill = new Border
                {
                    Child = pillText,
                    CornerRadius = new CornerRadius(14),
                    Padding = new Thickness(12, 5, 12, 5),
                    Margin = new Thickness(4, 0, 4, 0),
                    Background = B(C_Surface),
                    BorderBrush = B(C_Border),
                    BorderThickness = new Thickness(1)
                };
                _stepPills[i] = pill;
                _stepPillLabels[i] = pillText;
                stepStrip.Children.Add(pill);
            }
            var stepHost = new Border
            {
                Background = B(C_Card),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Child = stepStrip
            };
            Grid.SetRow(stepHost, 1);
            rootGrid.Children.Add(stepHost);

            // Initialize controls
            _lblHardwareBadge = new TextBlock { Text = "Sistem donanımı kontrol ediliyor...", Foreground = B(C_Muted), FontSize = 12 };
            _tbInstallDir = MakeTextBox(System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Foolmoon"));
            _cbDesktopShortcut = MakeCheckBox("Masaüstü kısayolu oluştur", true);
            _cbStartMenuShortcut = MakeCheckBox("Başlat menüsüne ekle", true);

            _tbName = MakeTextBox("");
            _tbAddressAs = MakeTextBox("");
            _cbLanguage = MakeComboBox(new[] { "Türkçe", "English", "Türkçe ve English (İkisi de)" }, 0);
            _cbStyle = MakeComboBox(new[]
            {
                "Samimi, kısa ve çözüm odaklı (soru sormadan doğrudan üret)",
                "Profesyonel, teknik ve yapılandırılmış",
                "Yaratıcı, görsel odaklı ve detaylı",
                "Sakin mentor — adım adım öğretici"
            }, 0);
            _tbRole = MakeTextBox("");
            _tbRules = MakeMultilineBox("");
            _cbSkin = MakeComboBox(new[]
            {
                "night-city|Night City — Karanlık Cyberpunk / Neon",
                "macos-frost|macOS Frost — Minimal Buzlu Cam",
                "foolmoon-warm|Warm Studio Cream — Sıcak Alabaster Kağıt"
            }, 1);

            _tbLmUrl = MakeTextBox("http://127.0.0.1:1234/v1");
            _lblLmStatus = new TextBlock { Text = "LM Studio taranıyor...", Foreground = B(C_Muted), FontSize = 12 };
            _lbModels = new ListBox
            {
                Height = 140,
                Background = B(C_Surface),
                Foreground = B(C_Text),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                Margin = new Thickness(0, 6, 0, 6)
            };
            _tbManualModel = MakeTextBox("");
            _rbUseLmStudio = new RadioButton { Content = "LM Studio (Yerel LLM — Önerilen)", IsChecked = true, Foreground = B(C_Text), Margin = new Thickness(0, 0, 18, 0) };
            _rbUseCustomApi = new RadioButton { Content = "Özel OpenAI-Uyumlu API", Foreground = B(C_Text) };
            _tbCustomBaseUrl = MakeTextBox("https://api.openai.com/v1");
            _tbCustomModel = MakeTextBox("");
            _pbCustomApiKey = new PasswordBox
            {
                Background = B(C_Surface),
                Foreground = B(C_Text),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 7, 10, 7),
                FontSize = 13
            };
            _customApiBox = new StackPanel { Visibility = Visibility.Collapsed, Margin = new Thickness(0, 8, 0, 0) };

            _progressBar = new ProgressBar
            {
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Height = 10,
                Background = B(C_Surface),
                Foreground = B(C_Accent),
                BorderThickness = new Thickness(0)
            };
            _lblPercent = new TextBlock { Text = "0%", Foreground = B(C_Accent), FontSize = 13, FontWeight = FontWeights.SemiBold };
            _lblCurrentStageMsg = new TextBlock { Text = "Kuruluma başlamaya hazır.", Foreground = B(C_Text), FontSize = 13 };
            _tbInstallLog = new TextBox
            {
                Height = 145,
                IsReadOnly = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                TextWrapping = TextWrapping.Wrap,
                Background = B(C_Card),
                Foreground = B(C_Muted),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                FontFamily = new FontFamily("Cascadia Mono, Consolas"),
                FontSize = 11,
                Padding = new Thickness(10)
            };

            _pages[0] = BuildWelcomePage();
            _pages[1] = BuildPersonalizePage();
            _pages[2] = BuildModelPage();
            _pages[3] = BuildInstallPage();

            _contentHost.Margin = new Thickness(32, 20, 32, 16);
            foreach (FrameworkElement page in _pages)
            {
                page.Visibility = Visibility.Collapsed;
                _contentHost.Children.Add(page);
            }
            Grid.SetRow(_contentHost, 2);
            rootGrid.Children.Add(_contentHost);

            // Footer buttons
            var footer = new Grid
            {
                Background = B(C_Card),
                Margin = new Thickness(0)
            };
            var footerBorder = new Border
            {
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Padding = new Thickness(28, 0, 28, 0),
                Child = footer
            };
            _btnBack = MakeSecondaryButton("Geri");
            _btnBack.HorizontalAlignment = HorizontalAlignment.Left;
            _btnBack.VerticalAlignment = VerticalAlignment.Center;
            _btnBack.Click += (s, e) => { if (!_installing && _step > 0) ShowStep(_step - 1); };

            _btnNext = MakePrimaryButton("Devam Et");
            _btnNext.HorizontalAlignment = HorizontalAlignment.Right;
            _btnNext.VerticalAlignment = VerticalAlignment.Center;
            _btnNext.Click += OnNextClicked;

            footer.Children.Add(_btnBack);
            footer.Children.Add(_btnNext);
            Grid.SetRow(footerBorder, 3);
            rootGrid.Children.Add(footerBorder);

            rootBorder.Child = rootGrid;
            Content = rootBorder;

            Loaded += (s, e) =>
            {
                ShowStep(0);
                DetectHardwareAsync();
                ProbeLmStudioAsync();
            };
        }

        private FrameworkElement BuildWelcomePage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeHeading("Bilgisayarına özel Hermes Agent deneyimi."));
            stack.Children.Add(MakeLead(
                "Foolmoon; dinamik Notch, akıllı bbot yardımcısı, yerel seslendirme, MCP araçları ve sıfır bozulma güvenceli " +
                "çift güncelleme sistemiyle saniyeler içinde LM Studio modellerine bağlanır."));

            var hwCard = MakeSectionCard("Donanım & Ortam Özeti");
            ((StackPanel)hwCard.Child).Children.Add(_lblHardwareBadge);
            stack.Children.Add(hwCard);

            var pathCard = MakeSectionCard("Kurulum Konumu & Kısayollar");
            var pathBody = (StackPanel)pathCard.Child;
            pathBody.Children.Add(MakeLabel("Kurulum Klasörü"));

            var row = new Grid();
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(_tbInstallDir, 0);
            var btnBrowse = MakeSecondaryButton("Gözat...");
            btnBrowse.Margin = new Thickness(10, 0, 0, 0);
            btnBrowse.Click += (s, e) =>
            {
                using (var dlg = new System.Windows.Forms.FolderBrowserDialog())
                {
                    dlg.SelectedPath = _tbInstallDir.Text;
                    if (dlg.ShowDialog() == System.Windows.Forms.DialogResult.OK)
                    {
                        _tbInstallDir.Text = System.IO.Path.Combine(dlg.SelectedPath, "Foolmoon");
                    }
                }
            };
            Grid.SetColumn(btnBrowse, 1);
            row.Children.Add(_tbInstallDir);
            row.Children.Add(btnBrowse);
            pathBody.Children.Add(row);
            pathBody.Children.Add(_cbDesktopShortcut);
            pathBody.Children.Add(_cbStartMenuShortcut);
            stack.Children.Add(pathCard);

            return new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = stack };
        }

        private FrameworkElement BuildPersonalizePage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeHeading("Hermes seni ilk açılışta tanısın."));
            stack.Children.Add(MakeLead(
                "Burada verdiğin bilgiler USER.md kalıcı hafızasına işlenir. İstediğin zaman Ayarlar → Hafıza bölümünden düzenleyebilirsin."));

            var card = MakeSectionCard("Kimlik & Hitap Tercihleri");
            var body = (StackPanel)card.Child;

            var grid2 = new Grid();
            grid2.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid2.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(14) });
            grid2.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var left = new StackPanel();
            left.Children.Add(MakeLabel("Adın"));
            left.Children.Add(_tbName);
            Grid.SetColumn(left, 0);

            var right = new StackPanel();
            right.Children.Add(MakeLabel("Sana Nasıl Hitap Etmeli?"));
            right.Children.Add(_tbAddressAs);
            Grid.SetColumn(right, 2);

            grid2.Children.Add(left);
            grid2.Children.Add(right);
            body.Children.Add(grid2);

            var gridLang = new Grid { Margin = new Thickness(0, 10, 0, 0) };
            gridLang.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            gridLang.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(14) });
            gridLang.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var colL = new StackPanel();
            colL.Children.Add(MakeLabel("Tercih Edilen Dil"));
            colL.Children.Add(_cbLanguage);
            Grid.SetColumn(colL, 0);

            var colR = new StackPanel();
            colR.Children.Add(MakeLabel("Varsayılan Görsel Tema"));
            colR.Children.Add(_cbSkin);
            Grid.SetColumn(colR, 2);

            gridLang.Children.Add(colL);
            gridLang.Children.Add(colR);
            body.Children.Add(gridLang);

            body.Children.Add(MakeLabel("Yanıt & Davranış Tarzı", 10));
            body.Children.Add(_cbStyle);

            body.Children.Add(MakeLabel("Mesleğin / İlgi Alanların", 10));
            body.Children.Add(_tbRole);

            body.Children.Add(MakeLabel("Hermes'in Her Zaman Uyması Gereken Kurallar (her satır ayrı hafıza kaydı)", 10));
            body.Children.Add(_tbRules);

            stack.Children.Add(card);
            return new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = stack };
        }

        private FrameworkElement BuildModelPage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeHeading("LM Studio veya API Modelini Bağla."));
            stack.Children.Add(MakeLead(
                "Sadece LM Studio ve indirdiğin tek bir LLM olması yeterli. Uygulama yüklü modelleri otomatik algılar."));

            var modeRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 4, 0, 12) };
            _rbUseLmStudio.Checked += (s, e) => UpdateProviderVisibility();
            _rbUseCustomApi.Checked += (s, e) => UpdateProviderVisibility();
            modeRow.Children.Add(_rbUseLmStudio);
            modeRow.Children.Add(_rbUseCustomApi);
            stack.Children.Add(modeRow);

            var lmCard = MakeSectionCard("LM Studio Bağlantısı");
            var lmBody = (StackPanel)lmCard.Child;
            var urlRow = new Grid();
            urlRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            urlRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(_tbLmUrl, 0);
            var btnScan = MakeSecondaryButton("Yeniden Tara");
            btnScan.Margin = new Thickness(10, 0, 0, 0);
            btnScan.Click += (s, e) => ProbeLmStudioAsync();
            Grid.SetColumn(btnScan, 1);
            urlRow.Children.Add(_tbLmUrl);
            urlRow.Children.Add(btnScan);
            lmBody.Children.Add(MakeLabel("Yerel Sunucu Adresi"));
            lmBody.Children.Add(urlRow);
            _lblLmStatus.Margin = new Thickness(0, 6, 0, 0);
            lmBody.Children.Add(_lblLmStatus);
            lmBody.Children.Add(_lbModels);
            lmBody.Children.Add(MakeLabel("veya Model Kimliğini Elle Yaz (LM Studio şu an kapalıysa):"));
            lmBody.Children.Add(_tbManualModel);
            _lbModels.SelectionChanged += (s, e) =>
            {
                string chosen = _lbModels.SelectedItem as string;
                if (!string.IsNullOrWhiteSpace(chosen))
                {
                    _tbManualModel.Text = chosen;
                }
            };
            stack.Children.Add(lmCard);

            _customApiBox.Children.Add(MakeLabel("API Base URL"));
            _customApiBox.Children.Add(_tbCustomBaseUrl);
            _customApiBox.Children.Add(MakeLabel("Model Adı", 8));
            _customApiBox.Children.Add(_tbCustomModel);
            _customApiBox.Children.Add(MakeLabel("API Anahtarı (yalnızca yerel .env dosyanıza kaydedilir)", 8));
            _customApiBox.Children.Add(_pbCustomApiKey);
            var customCard = MakeSectionCard("Özel OpenAI-Uyumlu API Ayarları");
            ((StackPanel)customCard.Child).Children.Add(_customApiBox);
            _customApiBox.Visibility = Visibility.Visible;
            customCard.Visibility = Visibility.Collapsed;
            _customApiBox.Tag = customCard;
            stack.Children.Add(customCard);

            return new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = stack };
        }

        private void UpdateProviderVisibility()
        {
            var customCard = _customApiBox.Tag as Border;
            if (customCard != null)
            {
                customCard.Visibility = _rbUseCustomApi.IsChecked == true ? Visibility.Visible : Visibility.Collapsed;
            }
        }

        private FrameworkElement BuildInstallPage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeHeading("Kurulum Durumu"));
            stack.Children.Add(MakeLead("Hermes çekirdeği, Foolmoon masaüstü arayüzü, MCP araçları ve kişisel hafızan kuruluyor."));

            var card = MakeSectionCard("İlerleme");
            var body = (StackPanel)card.Child;

            var topRow = new Grid();
            topRow.Children.Add(_lblCurrentStageMsg);
            _lblPercent.HorizontalAlignment = HorizontalAlignment.Right;
            topRow.Children.Add(_lblPercent);
            body.Children.Add(topRow);

            _progressBar.Margin = new Thickness(0, 8, 0, 14);
            body.Children.Add(_progressBar);

            string[][] stages =
            {
                new[] { "tools", "1. Git & Kurulum Araçları" },
                new[] { "repo", "2. Foolmoon + Hermes Deposu" },
                new[] { "runtime", "3. Python & Çekirdek Bağımlılıkları" },
                new[] { "desktop", "4. Masaüstü Arayüz Derlemesi" },
                new[] { "personalize", "5. LM Studio, Hafıza & MCP Araçları" },
                new[] { "shortcuts", "6. Kısayollar & Sistem Tepsisi" }
            };
            foreach (string[] st in stages)
            {
                var row = new Grid { Margin = new Thickness(0, 3, 0, 3) };
                var title = new TextBlock { Text = st[1], Foreground = B(C_Text), FontSize = 12.5 };
                var badge = new TextBlock { Text = "Bekliyor", Foreground = B(C_Muted), FontSize = 12, HorizontalAlignment = HorizontalAlignment.Right };
                _stageBadges[st[0]] = badge;
                row.Children.Add(title);
                row.Children.Add(badge);
                body.Children.Add(row);
            }
            stack.Children.Add(card);

            var logCard = MakeSectionCard("Kurulum Günlüğü");
            ((StackPanel)logCard.Child).Children.Add(_tbInstallLog);
            stack.Children.Add(logCard);

            return new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = stack };
        }

        private void ShowStep(int idx)
        {
            _step = idx;
            for (int i = 0; i < 4; i++)
            {
                _pages[i].Visibility = (i == idx) ? Visibility.Visible : Visibility.Collapsed;
                _stepPills[i].Background = B(i == idx ? C_Accent : C_Surface);
                _stepPills[i].BorderBrush = B(i == idx ? C_Accent : C_Border);
                _stepPillLabels[i].Foreground = B(i == idx ? Color.FromRgb(255, 255, 255) : C_Muted);
            }

            _btnBack.Visibility = (idx > 0 && !_installing && !_installDone) ? Visibility.Visible : Visibility.Collapsed;
            if (idx < 2) _btnNext.Content = "Devam Et";
            else if (idx == 2) _btnNext.Content = "Kurulumu Başlat";
            else if (_installDone) _btnNext.Content = "Foolmoon'u Başlat";
            else _btnNext.Content = "Kuruluyor...";
            _btnNext.IsEnabled = !_installing || _installDone;
        }

        private void OnNextClicked(object sender, RoutedEventArgs e)
        {
            if (_installDone)
            {
                string cmd = System.IO.Path.Combine(_tbInstallDir.Text.Trim(), "Start-Foolmoon.cmd");
                if (File.Exists(cmd))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = cmd,
                        WorkingDirectory = _tbInstallDir.Text.Trim(),
                        WindowStyle = ProcessWindowStyle.Hidden,
                        UseShellExecute = true
                    });
                }
                Close();
                return;
            }

            if (_step < 2)
            {
                ShowStep(_step + 1);
                return;
            }

            if (_step == 2)
            {
                ShowStep(3);
                StartInstallationAsync();
            }
        }

        private void DetectHardwareAsync()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                string gpu = "GPU algılanamadı (CPU + Windows SAPI ses yedeği hazır)";
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "nvidia-smi",
                        Arguments = "--query-gpu=name,memory.total --format=csv,noheader",
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    using (var proc = Process.Start(psi))
                    {
                        string outText = proc.StandardOutput.ReadToEnd().Trim();
                        proc.WaitForExit(3000);
                        if (proc.ExitCode == 0 && !string.IsNullOrWhiteSpace(outText))
                        {
                            gpu = "NVIDIA GPU: " + outText;
                        }
                    }
                }
                catch { }
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    _lblHardwareBadge.Text = gpu + " · Windows " + Environment.OSVersion.Version;
                }));
            });
        }

        private void ProbeLmStudioAsync()
        {
            string baseUrl = _tbLmUrl.Text.Trim().TrimEnd('/');
            _lblLmStatus.Text = "LM Studio taranıyor (" + baseUrl + "/models)...";
            _lblLmStatus.Foreground = B(C_Muted);

            ThreadPool.QueueUserWorkItem(_ =>
            {
                var found = new List<string>();
                string err = null;
                try
                {
                    var req = (HttpWebRequest)WebRequest.Create(baseUrl + "/models");
                    req.Timeout = 2500;
                    req.ReadWriteTimeout = 2500;
                    using (var resp = (HttpWebResponse)req.GetResponse())
                    using (var reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                    {
                        string json = reader.ReadToEnd();
                        var ser = new JavaScriptSerializer();
                        var obj = ser.DeserializeObject(json) as Dictionary<string, object>;
                        object[] items = (obj != null && obj.ContainsKey("data")) ? (obj["data"] as object[]) : null;
                        if (items != null)
                        {
                            foreach (object item in items)
                            {
                                var map = item as Dictionary<string, object>;
                                if (map != null && map.ContainsKey("id") && map["id"] != null)
                                {
                                    string id = map["id"].ToString();
                                    if (!id.ToLowerInvariant().Contains("embed"))
                                    {
                                        found.Add(id);
                                    }
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    err = ex.Message;
                }

                Dispatcher.BeginInvoke(new Action(() =>
                {
                    _lbModels.Items.Clear();
                    foreach (string m in found) _lbModels.Items.Add(m);
                    if (found.Count > 0)
                    {
                        _lbModels.SelectedIndex = 0;
                        _lblLmStatus.Text = found.Count + " adet sohbet modeli algılandı ve seçilmeye hazır.";
                        _lblLmStatus.Foreground = B(C_Success);
                    }
                    else
                    {
                        _lblLmStatus.Text = "LM Studio yanıt vermedi (" + (err ?? "model bulunamadı") + "). İstersen devam edip sonradan ayarlardan bağlayabilirsin.";
                        _lblLmStatus.Foreground = B(C_Muted);
                    }
                }));
            });
        }

        private void StartInstallationAsync()
        {
            _installing = true;
            _btnBack.Visibility = Visibility.Collapsed;
            _btnNext.IsEnabled = false;
            _btnNext.Content = "Kuruluyor...";

            string skinVal = (_cbSkin.SelectedItem as string ?? "night-city|").Split('|')[0];
            var cfg = new Dictionary<string, object>();
            cfg["installDir"] = _tbInstallDir.Text.Trim();
            cfg["createDesktopShortcut"] = _cbDesktopShortcut.IsChecked == true;
            cfg["createStartMenuShortcut"] = _cbStartMenuShortcut.IsChecked == true;
            cfg["userName"] = _tbName.Text.Trim();
            cfg["addressAs"] = _tbAddressAs.Text.Trim();
            cfg["language"] = _cbLanguage.SelectedItem as string ?? "Türkçe";
            cfg["style"] = _cbStyle.SelectedItem as string ?? "";
            cfg["userRole"] = _tbRole.Text.Trim();
            cfg["userRules"] = _tbRules.Text.Trim();
            cfg["skin"] = skinVal;
            cfg["providerMode"] = _rbUseCustomApi.IsChecked == true ? "custom_api" : "lmstudio";
            cfg["lmStudioUrl"] = _tbLmUrl.Text.Trim();
            cfg["selectedModel"] = _tbManualModel.Text.Trim();
            cfg["customBaseUrl"] = _tbCustomBaseUrl.Text.Trim();
            cfg["customModel"] = _tbCustomModel.Text.Trim();
            cfg["customApiKey"] = _pbCustomApiKey.Password;

            string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "foolmoon-setup-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);
            string scriptPath = System.IO.Path.Combine(tempDir, "bootstrap-foolmoon.ps1");
            string configPath = System.IO.Path.Combine(tempDir, "setup-config.json");

            File.WriteAllText(scriptPath, SetupApp.ExtractBootstrapScriptPreview(), new UTF8Encoding(false));
            File.WriteAllText(configPath, new JavaScriptSerializer().Serialize(cfg), new UTF8Encoding(false));

            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = "powershell.exe",
                        Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\" -ConfigFile \"" + configPath + "\"",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        StandardOutputEncoding = Encoding.UTF8,
                        StandardErrorEncoding = Encoding.UTF8,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };

                    using (var proc = Process.Start(psi))
                    {
                        var ser = new JavaScriptSerializer();
                        Thread errThread = new Thread(() =>
                        {
                            string errLine;
                            while ((errLine = proc.StandardError.ReadLine()) != null)
                            {
                                string captured = errLine;
                                Dispatcher.BeginInvoke(new Action(() => AppendLog("[ERR] " + captured)));
                            }
                        }) { IsBackground = true };
                        errThread.Start();

                        string line;
                        while ((line = proc.StandardOutput.ReadLine()) != null)
                        {
                            if (line.StartsWith("@@STAGE|"))
                            {
                                try
                                {
                                    var st = ser.DeserializeObject(line.Substring(8)) as Dictionary<string, object>;
                                    if (st != null)
                                    {
                                        string id = st["id"].ToString();
                                        string status = st["status"].ToString();
                                        int pct = Convert.ToInt32(st["percent"]);
                                        string msg = st["message"].ToString();
                                        Dispatcher.BeginInvoke(new Action(() =>
                                        {
                                            _progressBar.Value = pct;
                                            _lblPercent.Text = pct + "%";
                                            _lblCurrentStageMsg.Text = msg;
                                            if (_stageBadges.ContainsKey(id))
                                            {
                                                _stageBadges[id].Text = status == "done" ? "Tamamlandı" : status == "running" ? "Çalışıyor..." : status;
                                                _stageBadges[id].Foreground = B(status == "done" ? C_Success : C_Accent);
                                            }
                                            AppendLog("→ " + msg);
                                        }));
                                    }
                                }
                                catch { }
                            }
                            else if (!string.IsNullOrWhiteSpace(line))
                            {
                                string captured = line;
                                Dispatcher.BeginInvoke(new Action(() => AppendLog(captured)));
                            }
                        }

                        proc.WaitForExit();
                        errThread.Join(1500);

                        Dispatcher.BeginInvoke(new Action(() =>
                        {
                            _installing = false;
                            if (proc.ExitCode == 0)
                            {
                                _installDone = true;
                                _progressBar.Value = 100;
                                _lblPercent.Text = "100%";
                                _lblCurrentStageMsg.Text = "Kurulum tamamlandı!";
                                _lblCurrentStageMsg.Foreground = B(C_Success);
                                _btnNext.Content = "Foolmoon'u Başlat";
                                _btnNext.IsEnabled = true;
                            }
                            else
                            {
                                _lblCurrentStageMsg.Text = "Kurulum hatası (kod " + proc.ExitCode + "). Günlüğü inceleyin.";
                                _lblCurrentStageMsg.Foreground = B(C_Error);
                                _btnBack.Visibility = Visibility.Visible;
                                _btnNext.Content = "Yeniden Dene";
                                _btnNext.IsEnabled = true;
                            }
                        }));
                    }
                }
                catch (Exception ex)
                {
                    Dispatcher.BeginInvoke(new Action(() =>
                    {
                        _installing = false;
                        _lblCurrentStageMsg.Text = "Başlatma hatası: " + ex.Message;
                        _lblCurrentStageMsg.Foreground = B(C_Error);
                        AppendLog(ex.ToString());
                        _btnBack.Visibility = Visibility.Visible;
                        _btnNext.IsEnabled = true;
                        _btnNext.Content = "Yeniden Dene";
                    }));
                }
                finally
                {
                    try { Directory.Delete(tempDir, true); } catch { }
                }
            });
        }

        private void AppendLog(string line)
        {
            if (_tbInstallLog.Text.Length > 24000)
            {
                _tbInstallLog.Text = _tbInstallLog.Text.Substring(_tbInstallLog.Text.Length - 16000);
            }
            _tbInstallLog.AppendText(line + Environment.NewLine);
            _tbInstallLog.ScrollToEnd();
        }

        private static TextBlock MakeHeading(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = B(C_Text),
                FontSize = 22,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 6)
            };
        }

        private static TextBlock MakeLead(string text)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = B(C_Muted),
                FontSize = 13,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 14)
            };
        }

        private static TextBlock MakeLabel(string text, double topMargin = 0)
        {
            return new TextBlock
            {
                Text = text,
                Foreground = B(C_Muted),
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Margin = new Thickness(0, topMargin, 0, 4)
            };
        }

        private static Border MakeSectionCard(string title)
        {
            var sp = new StackPanel();
            sp.Children.Add(new TextBlock
            {
                Text = title,
                Foreground = B(C_Text),
                FontSize = 13.5,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 10)
            });
            return new Border
            {
                Background = B(C_Card),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(18, 14, 18, 16),
                Margin = new Thickness(0, 0, 0, 12),
                Child = sp
            };
        }

        private static TextBox MakeTextBox(string initial)
        {
            return new TextBox
            {
                Text = initial,
                Background = B(C_Surface),
                Foreground = B(C_Text),
                CaretBrush = B(C_Accent),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 7, 10, 7),
                FontSize = 13
            };
        }

        private static TextBox MakeMultilineBox(string initial)
        {
            return new TextBox
            {
                Text = initial,
                AcceptsReturn = true,
                Height = 72,
                TextWrapping = TextWrapping.Wrap,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Background = B(C_Surface),
                Foreground = B(C_Text),
                CaretBrush = B(C_Accent),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(10, 7, 10, 7),
                FontSize = 12.5
            };
        }

        private static ComboBox MakeComboBox(string[] items, int defaultIdx)
        {
            var cb = new ComboBox
            {
                Padding = new Thickness(8, 6, 8, 6),
                FontSize = 12.5
            };
            foreach (string item in items) cb.Items.Add(item);
            if (items.Length > 0) cb.SelectedIndex = Math.Min(defaultIdx, items.Length - 1);
            return cb;
        }

        private static CheckBox MakeCheckBox(string text, bool isChecked)
        {
            return new CheckBox
            {
                Content = text,
                IsChecked = isChecked,
                Foreground = B(C_Text),
                FontSize = 12.5,
                Margin = new Thickness(0, 10, 0, 0)
            };
        }

        private static Button MakePrimaryButton(string text)
        {
            return new Button
            {
                Content = text,
                Background = B(C_Accent),
                Foreground = Brushes.White,
                BorderThickness = new Thickness(0),
                Padding = new Thickness(20, 9, 20, 9),
                FontSize = 13,
                FontWeight = FontWeights.SemiBold,
                Cursor = Cursors.Hand
            };
        }

        private static Button MakeSecondaryButton(string text)
        {
            return new Button
            {
                Content = text,
                Background = B(C_Surface),
                Foreground = B(C_Text),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(16, 8, 16, 8),
                FontSize = 12.5,
                Cursor = Cursors.Hand
            };
        }

        private static Button MakeGhostButton(string text)
        {
            return new Button
            {
                Content = text,
                Background = Brushes.Transparent,
                Foreground = B(C_Muted),
                BorderThickness = new Thickness(0),
                Padding = new Thickness(10, 4, 10, 4),
                FontSize = 13,
                Cursor = Cursors.Hand
            };
        }
    }
}
