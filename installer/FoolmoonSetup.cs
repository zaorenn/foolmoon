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
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Markup;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
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
        // Warm paper, crisp white, and crimson editorial palette
        private static readonly Color C_Paper = (Color)ColorConverter.ConvertFromString("#F7F3EC");
        private static readonly Color C_PaperCard = (Color)ColorConverter.ConvertFromString("#FFFFFF");
        private static readonly Color C_PaperInset = (Color)ColorConverter.ConvertFromString("#EFE9DF");
        private static readonly Color C_PaperHover = (Color)ColorConverter.ConvertFromString("#E7DFD3");
        private static readonly Color C_Border = (Color)ColorConverter.ConvertFromString("#E2D9CB");
        private static readonly Color C_BorderStrong = (Color)ColorConverter.ConvertFromString("#CFC3B2");
        private static readonly Color C_Ink = (Color)ColorConverter.ConvertFromString("#1A1715");
        private static readonly Color C_Muted = (Color)ColorConverter.ConvertFromString("#6E655B");
        private static readonly Color C_Red = (Color)ColorConverter.ConvertFromString("#C8372D");
        private static readonly Color C_RedHover = (Color)ColorConverter.ConvertFromString("#AD2B22");
        private static readonly Color C_RedSoft = (Color)ColorConverter.ConvertFromString("#FCECE9");
        private static readonly Color C_RedTintBorder = (Color)ColorConverter.ConvertFromString("#E5948B");
        private static readonly Color C_Success = (Color)ColorConverter.ConvertFromString("#1E7A4C");
        private static readonly Color C_SuccessSoft = (Color)ColorConverter.ConvertFromString("#E9F5EE");
        private static readonly Color C_Error = (Color)ColorConverter.ConvertFromString("#B91C1C");

        private static readonly FontFamily F_Ui = new FontFamily("Segoe UI Variable Text, Segoe UI");
        private static readonly FontFamily F_Serif = new FontFamily("Georgia, Times New Roman");
        private static readonly FontFamily F_Mono = new FontFamily("Cascadia Mono, Consolas");

        private static Brush B(Color c) { var b = new SolidColorBrush(c); b.Freeze(); return b; }

        private int _step = 0;
        private bool _installing = false;
        private bool _installDone = false;

        private readonly Border _cardShell;
        private readonly TranslateTransform _cardLift = new TranslateTransform(0, 14);
        private readonly TextBlock _lblStepCounter;
        private readonly Border[] _stepBars = new Border[4];
        private readonly Border _emblemBadge;
        private readonly Grid _contentHost = new Grid();
        private readonly FrameworkElement[] _pages = new FrameworkElement[4];
        private readonly Button _btnBack;
        private readonly Button _btnNext;

        // Step 1 state & controls
        private readonly TextBox _tbInstallDir;
        private bool _desktopShortcut = true;
        private bool _startMenuShortcut = true;
        private readonly TextBlock _lblHardwareBadge;
        private readonly TextBlock _lblOsBadge;
        private readonly Ellipse _hwStatusDot;

        // Step 2 state & controls
        private readonly TextBox _tbName;
        private readonly TextBox _tbAddressAs;
        private readonly TextBox _tbRole;
        private readonly TextBox _tbRules;
        private string _selectedLanguage = "English";
        private string _selectedSkin = "foolmoon-warm";
        private string _selectedStyle = "Concise, direct, and execution-focused (proceed without extra prompts)";
        private readonly List<ChipItem> _langChips = new List<ChipItem>();
        private readonly List<ChipItem> _skinCards = new List<ChipItem>();
        private readonly List<ChipItem> _styleCards = new List<ChipItem>();

        // Step 3 state & controls
        private bool _useCustomApi = false;
        private Border _segIndicator;
        private TranslateTransform _segTransform = new TranslateTransform(0, 0);
        private Button _segBtnLm;
        private Button _segBtnCustom;
        private Border _lmPanel;
        private Border _customPanel;
        private readonly TextBox _tbLmUrl;
        private readonly TextBlock _lblLmStatus;
        private readonly Ellipse _lmStatusDot;
        private readonly StackPanel _modelListPanel;
        private readonly TextBox _tbManualModel;
        private string _selectedDetectedModel = string.Empty;
        private readonly TextBox _tbCustomBaseUrl;
        private readonly TextBox _tbCustomModel;
        private readonly PasswordBox _pbCustomApiKey;

        // Step 4 state & controls
        private readonly Border _progressTrack;
        private readonly Border _progressFill;
        private readonly TextBlock _lblPercent;
        private readonly TextBlock _lblCurrentStageMsg;
        private double _currentPercent = 0;
        private readonly Dictionary<string, TextBlock> _stageBadges = new Dictionary<string, TextBlock>();
        private readonly Dictionary<string, Ellipse> _stageDots = new Dictionary<string, Ellipse>();
        private readonly TextBox _tbInstallLog;
        private readonly Border _logContainer;
        private bool _logExpanded = false;

        private sealed class ChipItem
        {
            public string Value;
            public bool Selected;
            public Border Container;
            public TextBlock PrimaryText;
            public TextBlock SecondaryText;
            public Ellipse RadioDot;
        }

        public SetupWindow()
        {
            Title = "Foolmoon Setup";
            Width = 572;
            Height = 720;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            ResizeMode = ResizeMode.NoResize;
            FontFamily = F_Ui;
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Ideal);

            RegisterResources();

            // Outer padding preserves space for soft window drop shadow
            var shadowCanvas = new Grid { Margin = new Thickness(18) };

            _cardShell = new Border
            {
                Background = B(C_Paper),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(26),
                Opacity = 0,
                RenderTransform = _cardLift,
                ClipToBounds = true,
                Effect = new DropShadowEffect
                {
                    BlurRadius = 28,
                    ShadowDepth = 8,
                    Direction = 270,
                    Opacity = 0.22,
                    Color = Colors.Black
                }
            };

            // Subtle warm paper sheen across top edge
            var innerClip = new Grid();
            var paperSheen = new Border
            {
                IsHitTestVisible = false,
                CornerRadius = new CornerRadius(25),
                BorderBrush = B(Color.FromArgb(180, 255, 255, 255)),
                BorderThickness = new Thickness(1),
                Background = new LinearGradientBrush(
                    Color.FromArgb(115, 255, 255, 255),
                    Color.FromArgb(0, 255, 255, 255),
                    new Point(0.5, 0),
                    new Point(0.5, 0.35))
            };
            innerClip.Children.Add(paperSheen);

            var mainLayout = new Grid();
            mainLayout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(136) });
            mainLayout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            mainLayout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(76) });

            // -----------------------------------------------------------------
            // Header: draggable chrome + hero emblem + animated step segments
            // -----------------------------------------------------------------
            var headerGrid = new Grid { Background = Brushes.Transparent };
            headerGrid.MouseLeftButtonDown += (s, e) => { if (e.LeftButton == MouseButtonState.Pressed) DragMove(); };

            var chromeRow = new Grid { Margin = new Thickness(24, 18, 20, 0), VerticalAlignment = VerticalAlignment.Top };
            _lblStepCounter = new TextBlock
            {
                Text = "STEP 01 OF 04",
                FontFamily = F_Mono,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = B(C_Red),
                VerticalAlignment = VerticalAlignment.Center
            };
            var stepPill = new Border
            {
                Background = B(C_RedSoft),
                BorderBrush = B(C_RedTintBorder),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(99),
                Padding = new Thickness(10, 4, 10, 4),
                HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Center,
                Child = _lblStepCounter
            };
            chromeRow.Children.Add(stepPill);

            var winButtons = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Center
            };
            var btnMin = MakeCircleGhostButton("—", false);
            btnMin.Click += (s, e) => WindowState = WindowState.Minimized;
            var btnClose = MakeCircleGhostButton("✕", true);
            btnClose.Margin = new Thickness(6, 0, 0, 0);
            btnClose.Click += (s, e) => { if (!_installing) Close(); };
            winButtons.Children.Add(btnMin);
            winButtons.Children.Add(btnClose);
            chromeRow.Children.Add(winButtons);
            headerGrid.Children.Add(chromeRow);

            // Hero crescent emblem & step segment rail
            var centerHero = new StackPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Bottom,
                Margin = new Thickness(0, 0, 0, 12)
            };

            var emblemScale = new ScaleTransform(1, 1);
            _emblemBadge = new Border
            {
                Width = 48,
                Height = 48,
                CornerRadius = new CornerRadius(16),
                Background = B(C_PaperCard),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                HorizontalAlignment = HorizontalAlignment.Center,
                RenderTransformOrigin = new Point(0.5, 0.5),
                RenderTransform = emblemScale,
                Effect = new DropShadowEffect
                {
                    BlurRadius = 12,
                    ShadowDepth = 3,
                    Opacity = 0.08,
                    Color = Colors.Black
                }
            };
            _emblemBadge.Child = BuildCrescentMark();
            centerHero.Children.Add(_emblemBadge);

            var railStack = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 12, 0, 0)
            };
            for (int i = 0; i < 4; i++)
            {
                int capturedIdx = i;
                var seg = new Border
                {
                    Width = i == 0 ? 40 : 20,
                    Height = 5,
                    CornerRadius = new CornerRadius(2.5),
                    Margin = new Thickness(3, 0, 3, 0),
                    Background = new SolidColorBrush(i == 0 ? C_Red : C_BorderStrong),
                    Cursor = Cursors.Hand
                };
                seg.MouseLeftButtonUp += (s, e) =>
                {
                    if (!_installing && !_installDone && capturedIdx < 3)
                    {
                        ShowStep(capturedIdx);
                    }
                };
                _stepBars[i] = seg;
                railStack.Children.Add(seg);
            }
            centerHero.Children.Add(railStack);
            headerGrid.Children.Add(centerHero);

            Grid.SetRow(headerGrid, 0);
            mainLayout.Children.Add(headerGrid);

            // -----------------------------------------------------------------
            // Initialize Step Controls
            // -----------------------------------------------------------------
            _hwStatusDot = new Ellipse { Width = 8, Height = 8, Fill = B(C_Muted), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 8, 0) };
            _lblHardwareBadge = new TextBlock { Text = "Scanning hardware...", Foreground = B(C_Ink), FontSize = 12.5, FontWeight = FontWeights.Medium, TextTrimming = TextTrimming.CharacterEllipsis };
            _lblOsBadge = new TextBlock { Text = "Windows " + Environment.OSVersion.Version, Foreground = B(C_Muted), FontSize = 11.5, Margin = new Thickness(0, 2, 0, 0) };
            _tbInstallDir = MakeStyledTextBox(
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Foolmoon"),
                "Select install directory...");

            _tbName = MakeStyledTextBox("", "e.g. Serhat");
            _tbAddressAs = MakeStyledTextBox("", "e.g. Serhat");
            _tbRole = MakeStyledTextBox("", "e.g. Software Engineering & Research");
            _tbRules = MakeStyledTextBox("", "One standing rule per line (optional)", true);

            _tbLmUrl = MakeStyledTextBox("http://127.0.0.1:1234/v1", "http://127.0.0.1:1234/v1");
            _lmStatusDot = new Ellipse { Width = 7, Height = 7, Fill = B(C_Muted), Margin = new Thickness(0, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center };
            _lblLmStatus = new TextBlock { Text = "Scanning LM Studio...", Foreground = B(C_Muted), FontSize = 11.5 };
            _modelListPanel = new StackPanel();
            _tbManualModel = MakeStyledTextBox("", "Model ID (if LM Studio is closed)");
            _tbCustomBaseUrl = MakeStyledTextBox("https://api.openai.com/v1", "https://api.openai.com/v1");
            _tbCustomModel = MakeStyledTextBox("", "e.g. gpt-4o");
            _pbCustomApiKey = MakeStyledPasswordBox();

            _progressTrack = new Border
            {
                Height = 10,
                CornerRadius = new CornerRadius(5),
                Background = B(C_PaperInset),
                ClipToBounds = true,
                Margin = new Thickness(0, 10, 0, 14)
            };
            _progressFill = new Border
            {
                Height = 10,
                Width = 0,
                CornerRadius = new CornerRadius(5),
                HorizontalAlignment = HorizontalAlignment.Left,
                Background = B(C_Red)
            };
            _progressTrack.Child = _progressFill;
            _progressTrack.SizeChanged += (s, e) =>
            {
                if (_currentPercent > 0) AnimateProgressTo(_currentPercent);
            };

            _lblPercent = new TextBlock
            {
                Text = "0%",
                FontFamily = F_Serif,
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = B(C_Red),
                VerticalAlignment = VerticalAlignment.Center
            };
            _lblCurrentStageMsg = new TextBlock
            {
                Text = "Ready to set up Foolmoon.",
                FontSize = 12.5,
                FontWeight = FontWeights.Medium,
                Foreground = B(C_Ink),
                TextWrapping = TextWrapping.Wrap,
                VerticalAlignment = VerticalAlignment.Center
            };
            _tbInstallLog = new TextBox
            {
                Height = 110,
                IsReadOnly = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                TextWrapping = TextWrapping.Wrap,
                Background = Brushes.Transparent,
                Foreground = B(C_Muted),
                BorderThickness = new Thickness(0),
                FontFamily = F_Mono,
                FontSize = 10.5,
                Padding = new Thickness(8)
            };
            _logContainer = new Border
            {
                Background = B(C_PaperInset),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(12),
                Visibility = Visibility.Collapsed,
                Margin = new Thickness(0, 8, 0, 0),
                Child = _tbInstallLog
            };

            _pages[0] = BuildWelcomePage();
            _pages[1] = BuildProfilePage();
            _pages[2] = BuildModelPage();
            _pages[3] = BuildInstallPage();

            _contentHost.Margin = new Thickness(28, 0, 28, 8);
            _contentHost.ClipToBounds = true;
            foreach (FrameworkElement page in _pages)
            {
                page.Visibility = Visibility.Collapsed;
                _contentHost.Children.Add(page);
            }
            Grid.SetRow(_contentHost, 1);
            mainLayout.Children.Add(_contentHost);

            // -----------------------------------------------------------------
            // Footer Actions
            // -----------------------------------------------------------------
            var footer = new Grid { Margin = new Thickness(28, 0, 28, 22), VerticalAlignment = VerticalAlignment.Bottom };
            footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            _btnBack = MakeSecondaryButton("Back");
            _btnBack.Margin = new Thickness(0, 0, 10, 0);
            _btnBack.Click += (s, e) => { if (!_installing && _step > 0) ShowStep(_step - 1); };
            Grid.SetColumn(_btnBack, 0);

            _btnNext = MakePrimaryButton("Continue");
            _btnNext.IsDefault = true;
            _btnNext.HorizontalAlignment = HorizontalAlignment.Stretch;
            _btnNext.Click += OnNextClicked;
            Grid.SetColumn(_btnNext, 1);

            footer.Children.Add(_btnBack);
            footer.Children.Add(_btnNext);
            Grid.SetRow(footer, 2);
            mainLayout.Children.Add(footer);

            innerClip.Children.Add(mainLayout);
            _cardShell.Child = innerClip;
            shadowCanvas.Children.Add(_cardShell);
            Content = shadowCanvas;

            Loaded += (s, e) =>
            {
                AnimateWindowEntrance();
                StartEmblemBreathingAnimation(emblemScale);
                ShowStep(0, true);
                DetectHardwareAsync();
                ProbeLmStudioAsync();
            };
        }

        private void RegisterResources()
        {
            // Global ultra-slim rounded ScrollBar style
            const string scrollStyleXaml =
                "<Style xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' " +
                "xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='ScrollBar'>" +
                "<Setter Property='Width' Value='5'/>" +
                "<Setter Property='MinWidth' Value='5'/>" +
                "<Setter Property='Background' Value='Transparent'/>" +
                "<Setter Property='Template'><Setter.Value>" +
                "<ControlTemplate TargetType='ScrollBar'>" +
                "<Grid Background='Transparent' Margin='2,4,0,4'>" +
                "<Track x:Name='PART_Track' IsDirectionReversed='True'>" +
                "<Track.DecreaseRepeatButton><RepeatButton Command='ScrollBar.PageUpCommand' Opacity='0' IsTabStop='False'/></Track.DecreaseRepeatButton>" +
                "<Track.Thumb><Thumb><Thumb.Template><ControlTemplate TargetType='Thumb'>" +
                "<Border x:Name='ThumbPill' Background='#CFC3B2' CornerRadius='2.5'/>" +
                "<ControlTemplate.Triggers><Trigger Property='IsMouseOver' Value='True'>" +
                "<Setter TargetName='ThumbPill' Property='Background' Value='#A69987'/>" +
                "</Trigger></ControlTemplate.Triggers>" +
                "</ControlTemplate></Thumb.Template></Thumb></Track.Thumb>" +
                "<Track.IncreaseRepeatButton><RepeatButton Command='ScrollBar.PageDownCommand' Opacity='0' IsTabStop='False'/></Track.IncreaseRepeatButton>" +
                "</Track></Grid></ControlTemplate></Setter.Value></Setter></Style>";

            var scrollStyle = (Style)XamlReader.Parse(scrollStyleXaml);
            Resources.Add(typeof(ScrollBar), scrollStyle);
        }

        private FrameworkElement BuildCrescentMark()
        {
            var g = new Grid { Width = 24, Height = 24 };
            var halo = new Ellipse
            {
                Width = 22,
                Height = 22,
                Fill = B(C_RedSoft),
                Stroke = B(C_RedTintBorder),
                StrokeThickness = 1
            };
            var crescent = new System.Windows.Shapes.Path
            {
                Data = Geometry.Parse("M14.2,5.6 A6.2,6.2 0 1,0 18.4,15.2 A5.0,5.0 0 1,1 14.2,5.6 Z"),
                Fill = B(C_Red),
                Stretch = Stretch.Uniform,
                Width = 13,
                Height = 13
            };
            g.Children.Add(halo);
            g.Children.Add(crescent);
            return g;
        }

        // =====================================================================
        // STEP 1: WELCOME & INSTALL LOCATION
        // =====================================================================
        private FrameworkElement BuildWelcomePage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeEditorialHeading("Welcome to Foolmoon."));
            stack.Children.Add(MakeLead("A local-first desktop workspace built on Hermes Agent, ready for LM Studio and voice tools."));

            // Hardware Card
            var hwCard = MakePaperCard(14);
            var hwGrid = new Grid();
            hwGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            hwGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            hwGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            Grid.SetColumn(_hwStatusDot, 0);
            var hwText = new StackPanel();
            hwText.Children.Add(_lblHardwareBadge);
            hwText.Children.Add(_lblOsBadge);
            Grid.SetColumn(hwText, 1);

            var readyTag = new Border
            {
                Background = B(C_PaperInset),
                CornerRadius = new CornerRadius(99),
                Padding = new Thickness(9, 4, 9, 4),
                VerticalAlignment = VerticalAlignment.Center,
                Child = new TextBlock { Text = "LOCAL READY", FontFamily = F_Mono, FontSize = 10, FontWeight = FontWeights.SemiBold, Foreground = B(C_Muted) }
            };
            Grid.SetColumn(readyTag, 2);

            hwGrid.Children.Add(_hwStatusDot);
            hwGrid.Children.Add(hwText);
            hwGrid.Children.Add(readyTag);
            hwCard.Child = hwGrid;
            stack.Children.Add(hwCard);

            // Install Path Card
            var pathCard = MakePaperCard(14);
            var pathStack = new StackPanel();
            pathStack.Children.Add(MakeFieldLabel("INSTALL DIRECTORY", 0));

            var pathRow = new Grid { Margin = new Thickness(0, 6, 0, 0) };
            pathRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            pathRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            Grid.SetColumn(_tbInstallDir, 0);
            var btnBrowse = MakeSecondaryButton("Browse");
            btnBrowse.Margin = new Thickness(8, 0, 0, 0);
            btnBrowse.Padding = new Thickness(14, 8, 14, 8);
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
            pathRow.Children.Add(_tbInstallDir);
            pathRow.Children.Add(btnBrowse);
            pathStack.Children.Add(pathRow);
            pathCard.Child = pathStack;
            stack.Children.Add(pathCard);

            // Custom Animated Toggle Cards
            var toggleGrid = new Grid();
            toggleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            toggleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            toggleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var desktopTile = MakeToggleCard("Desktop Shortcut", "Quick launch icon", true, val => _desktopShortcut = val);
            Grid.SetColumn(desktopTile, 0);
            var startTile = MakeToggleCard("Start Menu", "Pin to Windows Apps", true, val => _startMenuShortcut = val);
            Grid.SetColumn(startTile, 2);

            toggleGrid.Children.Add(desktopTile);
            toggleGrid.Children.Add(startTile);
            stack.Children.Add(toggleGrid);

            return stack;
        }

        // =====================================================================
        // STEP 2: PROFILE & MEMORY
        // =====================================================================
        private FrameworkElement BuildProfilePage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeEditorialHeading("Personalize your agent."));
            stack.Children.Add(MakeLead("Saved into USER.md memory — editable anytime under Settings."));

            // Identity Row
            var nameRow = new Grid { Margin = new Thickness(0, 0, 0, 10) };
            nameRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            nameRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(10) });
            nameRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var colL = new StackPanel();
            colL.Children.Add(MakeFieldLabel("YOUR NAME", 0));
            colL.Children.Add(_tbName);
            Grid.SetColumn(colL, 0);

            var colR = new StackPanel();
            colR.Children.Add(MakeFieldLabel("ADDRESS YOU AS", 0));
            colR.Children.Add(_tbAddressAs);
            Grid.SetColumn(colR, 2);

            nameRow.Children.Add(colL);
            nameRow.Children.Add(colR);
            stack.Children.Add(nameRow);

            // Preferred Language Chips
            stack.Children.Add(MakeFieldLabel("PREFERRED LANGUAGE", 2));
            var langWrap = new WrapPanel { Margin = new Thickness(0, 4, 0, 10) };
            string[] langs = { "English", "Türkçe", "Deutsch", "Español", "Français", "Multilingual" };
            foreach (string l in langs)
            {
                string captured = l;
                var chip = MakePillChip(l, l == _selectedLanguage);
                chip.Container.MouseLeftButtonUp += (s, e) => SelectLanguage(captured);
                _langChips.Add(chip);
                langWrap.Children.Add(chip.Container);
            }
            stack.Children.Add(langWrap);

            // Visual Theme Visual Swatch Cards (Replaces raw pipe-delimited dropdown)
            stack.Children.Add(MakeFieldLabel("DEFAULT VISUAL THEME", 2));
            var skinGrid = new Grid { Margin = new Thickness(0, 4, 0, 10) };
            skinGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            skinGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            skinGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            skinGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            skinGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            string[][] skins =
            {
                new[] { "obsidian-circuit", "Obsidian", "Graphite · Cyan", "#13161C", "#06B6D4" },
                new[] { "lunar-frost", "Lunar Frost", "Slate Glass", "#1D2436", "#7C5CFC" },
                new[] { "foolmoon-warm", "Warm Paper", "Alabaster · Red", "#F7F3EC", "#C8372D" }
            };
            for (int i = 0; i < skins.Length; i++)
            {
                string[] sk = skins[i];
                var tile = MakeThemeTile(sk[0], sk[1], sk[2], sk[3], sk[4], sk[0] == _selectedSkin);
                string val = sk[0];
                tile.Container.MouseLeftButtonUp += (s, e) => SelectSkin(val);
                _skinCards.Add(tile);
                Grid.SetColumn(tile.Container, i * 2);
                skinGrid.Children.Add(tile.Container);
            }
            stack.Children.Add(skinGrid);

            // Behavior Style 2x2 Cards
            stack.Children.Add(MakeFieldLabel("RESPONSE STYLE", 2));
            var styleGrid = new Grid { Margin = new Thickness(0, 4, 0, 10) };
            styleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            styleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(8) });
            styleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            styleGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            styleGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(8) });
            styleGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            string[][] styles =
            {
                new[] { "Concise, direct, and execution-focused (proceed without extra prompts)", "Concise & Direct", "No extra prompts" },
                new[] { "Technical, structured, and engineering-grade", "Engineering Grade", "Structured depth" },
                new[] { "Visual, detailed, and design-oriented", "Visual & Design", "Rich formatting" },
                new[] { "Guided step-by-step explanations", "Guided Stepwise", "Clear walkthroughs" }
            };
            for (int i = 0; i < styles.Length; i++)
            {
                string[] st = styles[i];
                var card = MakeStyleTile(st[0], st[1], st[2], st[0] == _selectedStyle);
                string val = st[0];
                card.Container.MouseLeftButtonUp += (s, e) => SelectStyle(val);
                _styleCards.Add(card);
                Grid.SetColumn(card.Container, (i % 2) * 2);
                Grid.SetRow(card.Container, (i / 2) * 2);
                styleGrid.Children.Add(card.Container);
            }
            stack.Children.Add(styleGrid);

            // Role & Standing Rules
            stack.Children.Add(MakeFieldLabel("PRIMARY ROLE / WORKFLOW", 2));
            _tbRole.Margin = new Thickness(0, 4, 0, 10);
            stack.Children.Add(_tbRole);

            stack.Children.Add(MakeFieldLabel("STANDING MEMORY RULES", 0));
            _tbRules.Margin = new Thickness(0, 4, 0, 6);
            stack.Children.Add(_tbRules);

            return new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Padding = new Thickness(0, 0, 4, 0),
                Content = stack
            };
        }

        // =====================================================================
        // STEP 3: LM STUDIO & MODEL
        // =====================================================================
        private FrameworkElement BuildModelPage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeEditorialHeading("Connect your model."));
            stack.Children.Add(MakeLead("Only LM Studio and one local model are required. Running models appear below automatically."));

            // Animated Sliding Segmented Pill Track
            var segTrack = new Border
            {
                Background = B(C_PaperInset),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(14),
                Padding = new Thickness(4),
                Margin = new Thickness(0, 0, 0, 12)
            };
            var segGrid = new Grid();
            segGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            segGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            _segIndicator = new Border
            {
                Background = B(C_PaperCard),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(10),
                RenderTransform = _segTransform,
                Effect = new DropShadowEffect { BlurRadius = 8, ShadowDepth = 2, Opacity = 0.07, Color = Colors.Black }
            };
            Grid.SetColumn(_segIndicator, 0);
            segGrid.Children.Add(_segIndicator);

            _segBtnLm = MakeSegmentButton("LM Studio (Local)", true);
            _segBtnLm.Click += (s, e) => SetProviderMode(false);
            Grid.SetColumn(_segBtnLm, 0);

            _segBtnCustom = MakeSegmentButton("Custom OpenAI API", false);
            _segBtnCustom.Click += (s, e) => SetProviderMode(true);
            Grid.SetColumn(_segBtnCustom, 1);

            segGrid.Children.Add(_segBtnLm);
            segGrid.Children.Add(_segBtnCustom);
            segTrack.Child = segGrid;
            stack.Children.Add(segTrack);

            // LM Studio Panel
            _lmPanel = MakePaperCard(14);
            var lmBody = new StackPanel();
            lmBody.Children.Add(MakeFieldLabel("LOCAL SERVER URL", 0));

            var urlRow = new Grid { Margin = new Thickness(0, 6, 0, 8) };
            urlRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            urlRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(_tbLmUrl, 0);
            var btnScan = MakeSecondaryButton("Rescan");
            btnScan.Margin = new Thickness(8, 0, 0, 0);
            btnScan.Padding = new Thickness(14, 8, 14, 8);
            btnScan.Click += (s, e) => ProbeLmStudioAsync();
            Grid.SetColumn(btnScan, 1);
            urlRow.Children.Add(_tbLmUrl);
            urlRow.Children.Add(btnScan);
            lmBody.Children.Add(urlRow);

            var statusRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 8) };
            statusRow.Children.Add(_lmStatusDot);
            statusRow.Children.Add(_lblLmStatus);
            lmBody.Children.Add(statusRow);

            var modelScroll = new ScrollViewer
            {
                MaxHeight = 132,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Margin = new Thickness(0, 0, 0, 10),
                Content = _modelListPanel
            };
            lmBody.Children.Add(modelScroll);

            lmBody.Children.Add(MakeFieldLabel("MANUAL MODEL ID", 0));
            _tbManualModel.Margin = new Thickness(0, 5, 0, 0);
            lmBody.Children.Add(_tbManualModel);

            _lmPanel.Child = lmBody;
            stack.Children.Add(_lmPanel);

            // Custom OpenAI API Panel
            _customPanel = MakePaperCard(14);
            _customPanel.Visibility = Visibility.Collapsed;
            var customBody = new StackPanel();
            customBody.Children.Add(MakeFieldLabel("API BASE URL", 0));
            _tbCustomBaseUrl.Margin = new Thickness(0, 5, 0, 10);
            customBody.Children.Add(_tbCustomBaseUrl);

            customBody.Children.Add(MakeFieldLabel("MODEL ID", 0));
            _tbCustomModel.Margin = new Thickness(0, 5, 0, 10);
            customBody.Children.Add(_tbCustomModel);

            customBody.Children.Add(MakeFieldLabel("API KEY (LOCAL .ENV ONLY)", 0));
            _pbCustomApiKey.Margin = new Thickness(0, 5, 0, 0);
            customBody.Children.Add(_pbCustomApiKey);
            _customPanel.Child = customBody;
            stack.Children.Add(_customPanel);

            return new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Content = stack
            };
        }

        // =====================================================================
        // STEP 4: INSTALL PROGRESS
        // =====================================================================
        private FrameworkElement BuildInstallPage()
        {
            var stack = new StackPanel();
            stack.Children.Add(MakeEditorialHeading("Setting up Foolmoon."));
            stack.Children.Add(MakeLead("Configuring Hermes Core, Desktop workspace, MCP servers, and initial memory."));

            var progressCard = MakePaperCard(16);
            var body = new StackPanel();

            var topRow = new Grid();
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            topRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(_lblCurrentStageMsg, 0);
            Grid.SetColumn(_lblPercent, 1);
            topRow.Children.Add(_lblCurrentStageMsg);
            topRow.Children.Add(_lblPercent);
            body.Children.Add(topRow);

            body.Children.Add(_progressTrack);

            string[][] stages =
            {
                new[] { "tools", "Git & Runtime Tools" },
                new[] { "repo", "Foolmoon + Hermes Sources" },
                new[] { "runtime", "Python & Core Dependencies" },
                new[] { "desktop", "Desktop Workspace Build" },
                new[] { "personalize", "LM Studio, Memory & MCPs" },
                new[] { "shortcuts", "Shortcuts & System Tray" }
            };
            foreach (string[] st in stages)
            {
                var row = new Grid { Margin = new Thickness(0, 4, 0, 4) };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                var dot = new Ellipse
                {
                    Width = 8,
                    Height = 8,
                    Fill = B(C_BorderStrong),
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 0, 10, 0)
                };
                Grid.SetColumn(dot, 0);
                _stageDots[st[0]] = dot;

                var title = new TextBlock
                {
                    Text = st[1],
                    Foreground = B(C_Ink),
                    FontSize = 12.5,
                    VerticalAlignment = VerticalAlignment.Center
                };
                Grid.SetColumn(title, 1);

                var badge = new TextBlock
                {
                    Text = "Pending",
                    Foreground = B(C_Muted),
                    FontFamily = F_Mono,
                    FontSize = 11,
                    VerticalAlignment = VerticalAlignment.Center
                };
                Grid.SetColumn(badge, 2);
                _stageBadges[st[0]] = badge;

                row.Children.Add(dot);
                row.Children.Add(title);
                row.Children.Add(badge);
                body.Children.Add(row);
            }

            // Sleek toggleable install log drawer
            var logToggle = new TextBlock
            {
                Text = "Show installation log ▾",
                Foreground = B(C_Red),
                FontSize = 11.5,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 12, 0, 0),
                Cursor = Cursors.Hand,
                HorizontalAlignment = HorizontalAlignment.Left
            };
            logToggle.MouseLeftButtonUp += (s, e) =>
            {
                _logExpanded = !_logExpanded;
                _logContainer.Visibility = _logExpanded ? Visibility.Visible : Visibility.Collapsed;
                logToggle.Text = _logExpanded ? "Hide installation log ▴" : "Show installation log ▾";
            };
            body.Children.Add(logToggle);
            body.Children.Add(_logContainer);

            progressCard.Child = body;
            stack.Children.Add(progressCard);

            return new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled,
                Content = stack
            };
        }

        // =====================================================================
        // STEP NAVIGATION & ANIMATIONS
        // =====================================================================
        private void AnimateWindowEntrance()
        {
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(320)) { EasingFunction = ease };
            var lift = new DoubleAnimation(14, 0, TimeSpan.FromMilliseconds(340)) { EasingFunction = ease };
            _cardShell.BeginAnimation(OpacityProperty, fade);
            _cardLift.BeginAnimation(TranslateTransform.YProperty, lift);
        }

        private void StartEmblemBreathingAnimation(ScaleTransform scale)
        {
            var ease = new SineEase { EasingMode = EasingMode.EaseInOut };
            var anim = new DoubleAnimation(1.0, 1.05, TimeSpan.FromSeconds(2.4))
            {
                AutoReverse = true,
                RepeatBehavior = RepeatBehavior.Forever,
                EasingFunction = ease
            };
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
        }

        private void ShowStep(int idx, bool immediate = false)
        {
            int prev = _step;
            _step = idx;
            _lblStepCounter.Text = "STEP 0" + (idx + 1) + " OF 04";

            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            int dir = (idx >= prev) ? 1 : -1;

            for (int i = 0; i < 4; i++)
            {
                if (i == idx)
                {
                    _pages[i].Visibility = Visibility.Visible;
                    if (immediate)
                    {
                        _pages[i].Opacity = 1;
                        _pages[i].RenderTransform = new TranslateTransform(0, 0);
                    }
                    else
                    {
                        var tx = new TranslateTransform(dir * 26, 0);
                        _pages[i].RenderTransform = tx;
                        _pages[i].Opacity = 0;
                        tx.BeginAnimation(TranslateTransform.XProperty,
                            new DoubleAnimation(dir * 26, 0, TimeSpan.FromMilliseconds(280)) { EasingFunction = ease });
                        _pages[i].BeginAnimation(OpacityProperty,
                            new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(230)) { EasingFunction = ease });
                    }
                }
                else
                {
                    _pages[i].Visibility = Visibility.Collapsed;
                }

                // Animate pill indicator width & color
                double targetW = (i == idx) ? 42 : 20;
                Color targetColor = (i == idx) ? C_Red : (i < idx ? C_RedTintBorder : C_BorderStrong);
                if (immediate)
                {
                    _stepBars[i].Width = targetW;
                    _stepBars[i].Background = new SolidColorBrush(targetColor);
                }
                else
                {
                    _stepBars[i].BeginAnimation(WidthProperty,
                        new DoubleAnimation(targetW, TimeSpan.FromMilliseconds(240)) { EasingFunction = ease });
                    var sb = _stepBars[i].Background as SolidColorBrush;
                    if (sb == null || sb.IsFrozen)
                    {
                        sb = new SolidColorBrush(C_BorderStrong);
                        _stepBars[i].Background = sb;
                    }
                    sb.BeginAnimation(SolidColorBrush.ColorProperty,
                        new ColorAnimation(targetColor, TimeSpan.FromMilliseconds(240)));
                }
            }

            _btnBack.Visibility = (idx > 0 && !_installing && !_installDone) ? Visibility.Visible : Visibility.Collapsed;
            if (idx == 0) _btnNext.Content = "Get Started";
            else if (idx == 1) _btnNext.Content = "Continue";
            else if (idx == 2) _btnNext.Content = "Install Foolmoon";
            else if (_installDone) _btnNext.Content = "Launch Foolmoon";
            else _btnNext.Content = "Installing...";

            _btnNext.IsEnabled = !_installing || _installDone;
        }

        private void SetProviderMode(bool custom)
        {
            if (_useCustomApi == custom) return;
            _useCustomApi = custom;

            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            double targetX = custom ? _segIndicator.ActualWidth : 0;
            _segTransform.BeginAnimation(TranslateTransform.XProperty,
                new DoubleAnimation(targetX, TimeSpan.FromMilliseconds(240)) { EasingFunction = ease });

            _segBtnLm.Foreground = B(custom ? C_Muted : C_Ink);
            _segBtnCustom.Foreground = B(custom ? C_Ink : C_Muted);

            Border showPanel = custom ? _customPanel : _lmPanel;
            Border hidePanel = custom ? _lmPanel : _customPanel;
            hidePanel.Visibility = Visibility.Collapsed;
            showPanel.Visibility = Visibility.Visible;
            showPanel.Opacity = 0;
            var ty = new TranslateTransform(0, 8);
            showPanel.RenderTransform = ty;
            ty.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(8, 0, TimeSpan.FromMilliseconds(240)) { EasingFunction = ease });
            showPanel.BeginAnimation(OpacityProperty, new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(220)) { EasingFunction = ease });
        }

        private void AnimateProgressTo(double pct)
        {
            _currentPercent = pct;
            double maxW = _progressTrack.ActualWidth;
            if (maxW <= 0) maxW = 420;
            double targetW = maxW * Math.Max(0, Math.Min(100, pct)) / 100.0;
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
            _progressFill.BeginAnimation(WidthProperty, new DoubleAnimation(targetW, TimeSpan.FromMilliseconds(360)) { EasingFunction = ease });
        }

        // =====================================================================
        // CHIP & TILE SELECTION HELPERS
        // =====================================================================
        private void SelectLanguage(string lang)
        {
            _selectedLanguage = lang;
            foreach (ChipItem item in _langChips)
            {
                bool active = item.Value == lang;
                item.Selected = active;
                item.Container.Background = B(active ? C_Red : C_PaperCard);
                item.Container.BorderBrush = B(active ? C_Red : C_Border);
                item.PrimaryText.Foreground = B(active ? Colors.White : C_Ink);
            }
        }

        private void SelectSkin(string skinId)
        {
            _selectedSkin = skinId;
            foreach (ChipItem item in _skinCards)
            {
                bool active = item.Value == skinId;
                item.Selected = active;
                item.Container.Background = B(active ? C_RedSoft : C_PaperCard);
                item.Container.BorderBrush = B(active ? C_Red : C_Border);
                item.Container.BorderThickness = new Thickness(active ? 1.5 : 1);
            }
        }

        private void SelectStyle(string styleVal)
        {
            _selectedStyle = styleVal;
            foreach (ChipItem item in _styleCards)
            {
                bool active = item.Value == styleVal;
                item.Selected = active;
                item.Container.Background = B(active ? C_RedSoft : C_PaperCard);
                item.Container.BorderBrush = B(active ? C_Red : C_Border);
                item.Container.BorderThickness = new Thickness(active ? 1.5 : 1);
                if (item.RadioDot != null)
                {
                    item.RadioDot.Fill = B(active ? C_Red : C_BorderStrong);
                }
            }
        }

        // =====================================================================
        // ACTIONS, PROBING & INSTALLATION
        // =====================================================================
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
                string gpu = "CPU Mode (Windows SAPI Ready)";
                bool hasGpu = false;
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
                            gpu = outText;
                            hasGpu = true;
                        }
                    }
                }
                catch { }
                Dispatcher.BeginInvoke(new Action(() =>
                {
                    _lblHardwareBadge.Text = gpu;
                    _hwStatusDot.Fill = B(hasGpu ? C_Success : C_Red);
                }));
            });
        }

        private void ProbeLmStudioAsync()
        {
            string baseUrl = _tbLmUrl.Text.Trim().TrimEnd('/');
            _lblLmStatus.Text = "Scanning " + baseUrl + "...";
            _lblLmStatus.Foreground = B(C_Muted);
            _lmStatusDot.Fill = B(C_Muted);

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
                    PopulateModelCards(found, err);
                }));
            });
        }

        private void PopulateModelCards(List<string> models, string err)
        {
            _modelListPanel.Children.Clear();
            if (models.Count > 0)
            {
                _lblLmStatus.Text = models.Count + " chat model(s) ready to use";
                _lblLmStatus.Foreground = B(C_Success);
                _lmStatusDot.Fill = B(C_Success);

                if (string.IsNullOrWhiteSpace(_selectedDetectedModel) || !models.Contains(_selectedDetectedModel))
                {
                    _selectedDetectedModel = models[0];
                    _tbManualModel.Text = models[0];
                }

                var modelChips = new List<ChipItem>();
                foreach (string modelId in models)
                {
                    string captured = modelId;
                    bool isSelected = string.Equals(modelId, _selectedDetectedModel, StringComparison.Ordinal);

                    var row = new Grid();
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                    row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

                    var dot = new Ellipse
                    {
                        Width = 8,
                        Height = 8,
                        Fill = B(isSelected ? C_Red : C_BorderStrong),
                        Margin = new Thickness(0, 0, 10, 0),
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    Grid.SetColumn(dot, 0);

                    var nameLbl = new TextBlock
                    {
                        Text = modelId,
                        FontFamily = F_Mono,
                        FontSize = 11.5,
                        Foreground = B(C_Ink),
                        TextTrimming = TextTrimming.CharacterEllipsis,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    Grid.SetColumn(nameLbl, 1);

                    var tag = new TextBlock
                    {
                        Text = isSelected ? "Active" : "Select",
                        FontSize = 11,
                        FontWeight = FontWeights.SemiBold,
                        Foreground = B(isSelected ? C_Red : C_Muted),
                        VerticalAlignment = VerticalAlignment.Center
                    };
                    Grid.SetColumn(tag, 2);

                    row.Children.Add(dot);
                    row.Children.Add(nameLbl);
                    row.Children.Add(tag);

                    var card = new Border
                    {
                        Background = B(isSelected ? C_RedSoft : C_PaperInset),
                        BorderBrush = B(isSelected ? C_Red : C_Border),
                        BorderThickness = new Thickness(1),
                        CornerRadius = new CornerRadius(10),
                        Padding = new Thickness(12, 8, 12, 8),
                        Margin = new Thickness(0, 0, 0, 6),
                        Cursor = Cursors.Hand,
                        Child = row
                    };

                    var chip = new ChipItem
                    {
                        Value = captured,
                        Container = card,
                        PrimaryText = tag,
                        RadioDot = dot
                    };
                    modelChips.Add(chip);

                    card.MouseLeftButtonUp += (s, e) =>
                    {
                        _selectedDetectedModel = captured;
                        _tbManualModel.Text = captured;
                        foreach (ChipItem mc in modelChips)
                        {
                            bool act = mc.Value == captured;
                            mc.Container.Background = B(act ? C_RedSoft : C_PaperInset);
                            mc.Container.BorderBrush = B(act ? C_Red : C_Border);
                            mc.RadioDot.Fill = B(act ? C_Red : C_BorderStrong);
                            mc.PrimaryText.Text = act ? "Active" : "Select";
                            mc.PrimaryText.Foreground = B(act ? C_Red : C_Muted);
                        }
                    };
                    _modelListPanel.Children.Add(card);
                }
            }
            else
            {
                _lblLmStatus.Text = "LM Studio offline (" + (err ?? "no models") + ") — you can set a model ID manually below.";
                _lblLmStatus.Foreground = B(C_Muted);
                _lmStatusDot.Fill = B(C_Red);

                var emptyCard = new Border
                {
                    Background = B(C_PaperInset),
                    BorderBrush = B(C_Border),
                    BorderThickness = new Thickness(1),
                    CornerRadius = new CornerRadius(10),
                    Padding = new Thickness(12, 10, 12, 10),
                    Child = new TextBlock
                    {
                        Text = "No active LM Studio server found on this port. Start LM Studio and click Rescan, or continue and configure later.",
                        Foreground = B(C_Muted),
                        FontSize = 11.5,
                        TextWrapping = TextWrapping.Wrap
                    }
                };
                _modelListPanel.Children.Add(emptyCard);
            }
        }

        private void StartInstallationAsync()
        {
            _installing = true;
            _btnBack.Visibility = Visibility.Collapsed;
            _btnNext.IsEnabled = false;
            _btnNext.Content = "Installing...";
            AnimateProgressTo(4);

            var cfg = new Dictionary<string, object>();
            cfg["installDir"] = _tbInstallDir.Text.Trim();
            cfg["createDesktopShortcut"] = _desktopShortcut;
            cfg["createStartMenuShortcut"] = _startMenuShortcut;
            cfg["userName"] = _tbName.Text.Trim();
            cfg["addressAs"] = _tbAddressAs.Text.Trim();
            cfg["language"] = _selectedLanguage;
            cfg["style"] = _selectedStyle;
            cfg["userRole"] = _tbRole.Text.Trim();
            cfg["userRules"] = _tbRules.Text.Trim();
            cfg["skin"] = _selectedSkin;
            cfg["providerMode"] = _useCustomApi ? "custom_api" : "lmstudio";
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
                                            AnimateProgressTo(pct);
                                            _lblPercent.Text = pct + "%";
                                            _lblCurrentStageMsg.Text = msg;
                                            if (_stageBadges.ContainsKey(id))
                                            {
                                                bool isDone = status == "done";
                                                bool isRun = status == "running";
                                                _stageBadges[id].Text = isDone ? "Done" : (isRun ? "Running" : status);
                                                _stageBadges[id].Foreground = B(isDone ? C_Success : (isRun ? C_Red : C_Muted));
                                                if (_stageDots.ContainsKey(id))
                                                {
                                                    _stageDots[id].Fill = B(isDone ? C_Success : (isRun ? C_Red : C_BorderStrong));
                                                }
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
                                AnimateProgressTo(100);
                                _lblPercent.Text = "100%";
                                _lblPercent.Foreground = B(C_Success);
                                _lblCurrentStageMsg.Text = "Foolmoon is installed and ready.";
                                _lblCurrentStageMsg.Foreground = B(C_Success);
                                _btnNext.Content = "Launch Foolmoon";
                                _btnNext.IsEnabled = true;
                            }
                            else
                            {
                                _lblCurrentStageMsg.Text = "Installation failed (code " + proc.ExitCode + "). Check the log below.";
                                _lblCurrentStageMsg.Foreground = B(C_Error);
                                _logExpanded = true;
                                _logContainer.Visibility = Visibility.Visible;
                                _btnBack.Visibility = Visibility.Visible;
                                _btnNext.Content = "Retry Install";
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
                        _lblCurrentStageMsg.Text = "Launch error: " + ex.Message;
                        _lblCurrentStageMsg.Foreground = B(C_Error);
                        _logExpanded = true;
                        _logContainer.Visibility = Visibility.Visible;
                        AppendLog(ex.ToString());
                        _btnBack.Visibility = Visibility.Visible;
                        _btnNext.IsEnabled = true;
                        _btnNext.Content = "Retry Install";
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

        // =====================================================================
        // BESPOKE CONTROL BUILDERS
        // =====================================================================
        private static TextBlock MakeEditorialHeading(string text)
        {
            return new TextBlock
            {
                Text = text,
                FontFamily = F_Serif,
                FontSize = 23,
                FontWeight = FontWeights.Normal,
                Foreground = B(C_Ink),
                Margin = new Thickness(0, 0, 0, 4)
            };
        }

        private static TextBlock MakeLead(string text)
        {
            return new TextBlock
            {
                Text = text,
                FontSize = 12.5,
                Foreground = B(C_Muted),
                TextWrapping = TextWrapping.Wrap,
                LineHeight = 18,
                Margin = new Thickness(0, 0, 0, 14)
            };
        }

        private static TextBlock MakeFieldLabel(string text, double topMargin)
        {
            return new TextBlock
            {
                Text = text,
                FontFamily = F_Mono,
                FontSize = 10.5,
                FontWeight = FontWeights.SemiBold,
                Foreground = B(C_Muted),
                Margin = new Thickness(0, topMargin, 0, 0)
            };
        }

        private static Border MakePaperCard(double padding)
        {
            return new Border
            {
                Background = B(C_PaperCard),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(16),
                Padding = new Thickness(padding),
                Margin = new Thickness(0, 0, 0, 10),
                Effect = new DropShadowEffect
                {
                    BlurRadius = 10,
                    ShadowDepth = 2,
                    Opacity = 0.04,
                    Color = Colors.Black
                }
            };
        }

        private static TextBox MakeStyledTextBox(string initial, string placeholder, bool multiline = false)
        {
            string vertAlign = multiline ? "Top" : "Center";
            string fontSz = multiline ? "12" : "12.5";
            string radius = multiline ? "12" : "11";
            string tplXaml =
                "<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' " +
                "xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='TextBox'>" +
                "<Border x:Name='BoxBorder' Background='#FFFFFF' BorderBrush='#E2D9CB' BorderThickness='1.25' CornerRadius='" + radius + "' Padding='10,8,10,8'>" +
                "<Grid>" +
                "<TextBlock x:Name='PlaceholderText' Text='{TemplateBinding Tag}' Foreground='#A3988A' FontSize='" + fontSz + "' IsHitTestVisible='False' VerticalAlignment='" + vertAlign + "' Visibility='Collapsed'/>" +
                "<ScrollViewer x:Name='PART_ContentHost' Margin='0' VerticalAlignment='" + vertAlign + "'/>" +
                "</Grid>" +
                "</Border>" +
                "<ControlTemplate.Triggers>" +
                "<DataTrigger Binding='{Binding Text, RelativeSource={RelativeSource TemplatedParent}}' Value=''>" +
                "<Setter TargetName='PlaceholderText' Property='Visibility' Value='Visible'/>" +
                "</DataTrigger>" +
                "<Trigger Property='IsMouseOver' Value='True'>" +
                "<Setter TargetName='BoxBorder' Property='BorderBrush' Value='#CFC3B2'/>" +
                "</Trigger>" +
                "<Trigger Property='IsKeyboardFocused' Value='True'>" +
                "<Setter TargetName='BoxBorder' Property='BorderBrush' Value='#C8372D'/>" +
                "</Trigger>" +
                "</ControlTemplate.Triggers>" +
                "</ControlTemplate>";

            var tb = new TextBox
            {
                Text = initial ?? string.Empty,
                Tag = placeholder,
                Foreground = B(C_Ink),
                CaretBrush = B(C_Red),
                SelectionBrush = B(C_Red),
                SelectionOpacity = 0.2,
                FontSize = multiline ? 12 : 12.5,
                Margin = multiline ? new Thickness(0) : new Thickness(0, 4, 0, 0),
                Template = (ControlTemplate)XamlReader.Parse(tplXaml)
            };
            if (multiline)
            {
                tb.AcceptsReturn = true;
                tb.Height = 62;
                tb.TextWrapping = TextWrapping.Wrap;
                tb.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
                tb.HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled;
            }
            return tb;
        }

        private static PasswordBox MakeStyledPasswordBox()
        {
            const string tplXaml =
                "<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' " +
                "xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='PasswordBox'>" +
                "<Border x:Name='BoxBorder' Background='#FFFFFF' BorderBrush='#E2D9CB' BorderThickness='1.25' CornerRadius='11' Padding='10,8,10,8'>" +
                "<ScrollViewer x:Name='PART_ContentHost' Margin='0' VerticalAlignment='Center'/>" +
                "</Border>" +
                "<ControlTemplate.Triggers>" +
                "<Trigger Property='IsMouseOver' Value='True'>" +
                "<Setter TargetName='BoxBorder' Property='BorderBrush' Value='#CFC3B2'/>" +
                "</Trigger>" +
                "<Trigger Property='IsKeyboardFocused' Value='True'>" +
                "<Setter TargetName='BoxBorder' Property='BorderBrush' Value='#C8372D'/>" +
                "</Trigger>" +
                "</ControlTemplate.Triggers>" +
                "</ControlTemplate>";

            return new PasswordBox
            {
                Foreground = B(C_Ink),
                CaretBrush = B(C_Red),
                SelectionBrush = B(C_Red),
                FontSize = 12.5,
                Template = (ControlTemplate)XamlReader.Parse(tplXaml)
            };
        }

        private static Border MakeToggleCard(string title, string subtitle, bool initial, Action<bool> onChanged)
        {
            bool state = initial;
            var trackBrush = new SolidColorBrush(state ? C_Red : C_BorderStrong);
            var knobShift = new TranslateTransform(state ? 16 : 0, 0);

            var track = new Border
            {
                Width = 38,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                Background = trackBrush,
                Padding = new Thickness(3),
                VerticalAlignment = VerticalAlignment.Center
            };
            var knob = new Border
            {
                Width = 16,
                Height = 16,
                CornerRadius = new CornerRadius(8),
                Background = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Left,
                RenderTransform = knobShift,
                Effect = new DropShadowEffect { BlurRadius = 4, ShadowDepth = 1, Opacity = 0.18, Color = Colors.Black }
            };
            track.Child = knob;

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            var textCol = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            textCol.Children.Add(new TextBlock { Text = title, FontSize = 12.5, FontWeight = FontWeights.SemiBold, Foreground = B(C_Ink) });
            textCol.Children.Add(new TextBlock { Text = subtitle, FontSize = 11, Foreground = B(C_Muted), Margin = new Thickness(0, 1, 0, 0) });
            Grid.SetColumn(textCol, 0);
            Grid.SetColumn(track, 1);

            grid.Children.Add(textCol);
            grid.Children.Add(track);

            var card = new Border
            {
                Background = B(C_PaperCard),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(14),
                Padding = new Thickness(13, 11, 13, 11),
                Cursor = Cursors.Hand,
                Child = grid
            };

            card.MouseEnter += (s, e) => card.BorderBrush = B(C_BorderStrong);
            card.MouseLeave += (s, e) => card.BorderBrush = B(C_Border);
            card.MouseLeftButtonUp += (s, e) =>
            {
                state = !state;
                onChanged(state);
                var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
                knobShift.BeginAnimation(TranslateTransform.XProperty,
                    new DoubleAnimation(state ? 16 : 0, TimeSpan.FromMilliseconds(180)) { EasingFunction = ease });
                trackBrush.BeginAnimation(SolidColorBrush.ColorProperty,
                    new ColorAnimation(state ? C_Red : C_BorderStrong, TimeSpan.FromMilliseconds(180)));
            };

            return card;
        }

        private static ChipItem MakePillChip(string text, bool active)
        {
            var lbl = new TextBlock
            {
                Text = text,
                FontSize = 11.5,
                FontWeight = FontWeights.Medium,
                Foreground = B(active ? Colors.White : C_Ink)
            };
            var box = new Border
            {
                Background = B(active ? C_Red : C_PaperCard),
                BorderBrush = B(active ? C_Red : C_Border),
                BorderThickness = new Thickness(1),
                CornerRadius = new CornerRadius(99),
                Padding = new Thickness(11, 5, 11, 5),
                Margin = new Thickness(0, 0, 6, 6),
                Cursor = Cursors.Hand,
                Child = lbl
            };
            var item = new ChipItem { Value = text, Selected = active, Container = box, PrimaryText = lbl };
            AttachChipHover(item);
            return item;
        }

        private static ChipItem MakeThemeTile(string id, string title, string sub, string bgHex, string dotHex, bool active)
        {
            var sp = new StackPanel();
            var top = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 5) };
            var swatch = new Border
            {
                Width = 22,
                Height = 22,
                CornerRadius = new CornerRadius(7),
                Background = B((Color)ColorConverter.ConvertFromString(bgHex)),
                BorderBrush = B(C_Border),
                BorderThickness = new Thickness(1),
                Child = new Ellipse
                {
                    Width = 8,
                    Height = 8,
                    Fill = B((Color)ColorConverter.ConvertFromString(dotHex))
                }
            };
            top.Children.Add(swatch);
            sp.Children.Add(top);

            var lbl = new TextBlock { Text = title, FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = B(C_Ink) };
            var subLbl = new TextBlock { Text = sub, FontSize = 10.5, Foreground = B(C_Muted), Margin = new Thickness(0, 1, 0, 0) };
            sp.Children.Add(lbl);
            sp.Children.Add(subLbl);

            var box = new Border
            {
                Background = B(active ? C_RedSoft : C_PaperCard),
                BorderBrush = B(active ? C_Red : C_Border),
                BorderThickness = new Thickness(active ? 1.5 : 1),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(10, 9, 10, 9),
                Cursor = Cursors.Hand,
                Child = sp
            };

            var item = new ChipItem { Value = id, Selected = active, Container = box, PrimaryText = lbl, SecondaryText = subLbl };
            AttachChipHover(item);
            return item;
        }

        private static ChipItem MakeStyleTile(string fullVal, string title, string sub, bool active)
        {
            var g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var dot = new Ellipse
            {
                Width = 8,
                Height = 8,
                Fill = B(active ? C_Red : C_BorderStrong),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            Grid.SetColumn(dot, 0);

            var sp = new StackPanel();
            var lbl = new TextBlock { Text = title, FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = B(C_Ink) };
            var subLbl = new TextBlock { Text = sub, FontSize = 10.5, Foreground = B(C_Muted) };
            sp.Children.Add(lbl);
            sp.Children.Add(subLbl);
            Grid.SetColumn(sp, 1);

            g.Children.Add(dot);
            g.Children.Add(sp);

            var box = new Border
            {
                Background = B(active ? C_RedSoft : C_PaperCard),
                BorderBrush = B(active ? C_Red : C_Border),
                BorderThickness = new Thickness(active ? 1.5 : 1),
                CornerRadius = new CornerRadius(12),
                Padding = new Thickness(10, 8, 10, 8),
                Cursor = Cursors.Hand,
                Child = g
            };

            var item = new ChipItem { Value = fullVal, Selected = active, Container = box, PrimaryText = lbl, SecondaryText = subLbl, RadioDot = dot };
            AttachChipHover(item);
            return item;
        }

        private static void AttachChipHover(ChipItem item)
        {
            item.Container.MouseEnter += (s, e) =>
            {
                if (!item.Selected)
                {
                    item.Container.Background = B(C_PaperInset);
                    item.Container.BorderBrush = B(C_BorderStrong);
                }
            };
            item.Container.MouseLeave += (s, e) =>
            {
                if (!item.Selected)
                {
                    item.Container.Background = B(C_PaperCard);
                    item.Container.BorderBrush = B(C_Border);
                }
            };
        }

        private static Button MakeSegmentButton(string text, bool active)
        {
            const string tplXaml =
                "<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='Button'>" +
                "<Border Background='Transparent' Padding='{TemplateBinding Padding}'>" +
                "<ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>" +
                "</Border></ControlTemplate>";

            return new Button
            {
                Content = text,
                Foreground = B(active ? C_Ink : C_Muted),
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Padding = new Thickness(10, 8, 10, 8),
                Cursor = Cursors.Hand,
                Template = (ControlTemplate)XamlReader.Parse(tplXaml)
            };
        }

        private static Button MakePrimaryButton(string text)
        {
            const string tplXaml =
                "<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' " +
                "xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='Button'>" +
                "<Border x:Name='BtnBg' Background='{TemplateBinding Background}' CornerRadius='14' Padding='{TemplateBinding Padding}' RenderTransformOrigin='0.5,0.5'>" +
                "<Border.RenderTransform><ScaleTransform x:Name='BtnScale' ScaleX='1' ScaleY='1'/></Border.RenderTransform>" +
                "<ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>" +
                "</Border>" +
                "<ControlTemplate.Triggers>" +
                "<Trigger Property='IsPressed' Value='True'>" +
                "<Setter TargetName='BtnScale' Property='ScaleX' Value='0.98'/>" +
                "<Setter TargetName='BtnScale' Property='ScaleY' Value='0.98'/>" +
                "</Trigger>" +
                "<Trigger Property='IsEnabled' Value='False'>" +
                "<Setter TargetName='BtnBg' Property='Opacity' Value='0.55'/>" +
                "</Trigger>" +
                "</ControlTemplate.Triggers>" +
                "</ControlTemplate>";

            var bgBrush = new SolidColorBrush(C_Red);
            var btn = new Button
            {
                Content = text,
                Background = bgBrush,
                Foreground = Brushes.White,
                Padding = new Thickness(20, 12, 20, 12),
                FontSize = 13.5,
                FontWeight = FontWeights.SemiBold,
                Cursor = Cursors.Hand,
                Template = (ControlTemplate)XamlReader.Parse(tplXaml),
                Effect = new DropShadowEffect { BlurRadius = 14, ShadowDepth = 4, Opacity = 0.2, Color = C_Red }
            };
            btn.MouseEnter += (s, e) => bgBrush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(C_RedHover, TimeSpan.FromMilliseconds(150)));
            btn.MouseLeave += (s, e) => bgBrush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(C_Red, TimeSpan.FromMilliseconds(150)));
            return btn;
        }

        private static Button MakeSecondaryButton(string text)
        {
            const string tplXaml =
                "<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' " +
                "xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml' TargetType='Button'>" +
                "<Border x:Name='BtnBg' Background='{TemplateBinding Background}' BorderBrush='#E2D9CB' BorderThickness='1.25' CornerRadius='14' Padding='{TemplateBinding Padding}'>" +
                "<ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>" +
                "</Border>" +
                "<ControlTemplate.Triggers>" +
                "<Trigger Property='IsPressed' Value='True'>" +
                "<Setter TargetName='BtnBg' Property='BorderBrush' Value='#C8372D'/>" +
                "</Trigger>" +
                "</ControlTemplate.Triggers>" +
                "</ControlTemplate>";

            var bgBrush = new SolidColorBrush(C_PaperCard);
            var btn = new Button
            {
                Content = text,
                Background = bgBrush,
                Foreground = B(C_Ink),
                Padding = new Thickness(18, 11, 18, 11),
                FontSize = 13,
                FontWeight = FontWeights.Medium,
                Cursor = Cursors.Hand,
                Template = (ControlTemplate)XamlReader.Parse(tplXaml)
            };
            btn.MouseEnter += (s, e) => bgBrush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(C_PaperInset, TimeSpan.FromMilliseconds(140)));
            btn.MouseLeave += (s, e) => bgBrush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(C_PaperCard, TimeSpan.FromMilliseconds(140)));
            return btn;
        }

        private static Button MakeCircleGhostButton(string glyph, bool isClose)
        {
            const string tplXaml =
                "<ControlTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' TargetType='Button'>" +
                "<Border Background='{TemplateBinding Background}' CornerRadius='14' Width='28' Height='28'>" +
                "<ContentPresenter HorizontalAlignment='Center' VerticalAlignment='Center'/>" +
                "</Border></ControlTemplate>";

            var bgBrush = new SolidColorBrush(Colors.Transparent);
            var btn = new Button
            {
                Content = glyph,
                Background = bgBrush,
                Foreground = B(C_Muted),
                FontSize = 12,
                Cursor = Cursors.Hand,
                Template = (ControlTemplate)XamlReader.Parse(tplXaml)
            };
            btn.MouseEnter += (s, e) =>
            {
                bgBrush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(isClose ? C_RedSoft : C_PaperHover, TimeSpan.FromMilliseconds(130)));
                btn.Foreground = B(isClose ? C_Red : C_Ink);
            };
            btn.MouseLeave += (s, e) =>
            {
                bgBrush.BeginAnimation(SolidColorBrush.ColorProperty, new ColorAnimation(Colors.Transparent, TimeSpan.FromMilliseconds(130)));
                btn.Foreground = B(C_Muted);
            };
            return btn;
        }
    }
}
