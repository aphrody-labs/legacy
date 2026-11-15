// nt WinUI 3 shell: Mica window, extended title bar, Fluent NavigationView (3D kernel, SVG desktop, index),
// WebView2 (Chromium Edge, WebGPU) for the GPU scene served by src/host/server.ts. F11: full screen.
// Server URL: NT_URL (default http://localhost:8787/).
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Nt.App;

public static class Program
{
    [STAThread]
    private static void Main()
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        Application.Start(p =>
        {
            SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            _ = new NtApplication();
        });
    }
}

public sealed partial class NtApplication : Application
{
    private Window? window;

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        Resources.MergedDictionaries.Add(new XamlControlsResources());
        var baseUrl = new Uri(Environment.GetEnvironmentVariable("NT_URL") ?? "http://localhost:8787/");
        var web = new WebView2 { Source = baseUrl };
        var nav = new NavigationView
        {
            PaneDisplayMode = NavigationViewPaneDisplayMode.LeftCompact,
            IsBackButtonVisible = NavigationViewBackButtonVisible.Collapsed,
            IsSettingsVisible = false,
            Content = web,
        };
        (string label, Symbol icon, string path)[] pages =
        [
            ("Noyau NT en 3D", Symbol.World, ""),
            ("Vectorized desktop (SVG)", Symbol.Pictures, "desktop.svg"),
            ("Index C:\\Windows", Symbol.Find, "api/index/stats"),
            ("Proven Microsoft stack (msindex)", Symbol.Library, "api/msindex/stats"),
        ];
        foreach (var (label, icon, path) in pages)
            nav.MenuItems.Add(new NavigationViewItem { Content = label, Icon = new SymbolIcon(icon), Tag = path });
        nav.SelectedItem = nav.MenuItems[0];
        nav.SelectionChanged += (_, e) =>
        {
            if (e.SelectedItem is NavigationViewItem { Tag: string path })
                web.Source = new Uri(baseUrl, path);
        };

        window = new Window { Title = "nt", Content = nav, SystemBackdrop = new MicaBackdrop(), ExtendsContentIntoTitleBar = true };
        var appWindow = window.AppWindow;
        nav.KeyDown += (_, e) =>
        {
            if (e.Key != Windows.System.VirtualKey.F11)
                return;
            appWindow.SetPresenter(appWindow.Presenter.Kind == AppWindowPresenterKind.FullScreen ? AppWindowPresenterKind.Default : AppWindowPresenterKind.FullScreen);
        };
        appWindow.SetPresenter(AppWindowPresenterKind.Overlapped);
        if (appWindow.Presenter is OverlappedPresenter p)
            p.Maximize();
        window.Activate();
    }
}
