using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Tracking.Core;
using Windows.Storage;
using Windows.System;

namespace Tracking.Windows;
public sealed partial class MainWindow : Window
{
    private const string ServerKey = "server-url";
    private Uri? serverUri;
    public MainWindow() { InitializeComponent(); Title = "Unnamed Tracking"; Activated += OnActivated; }
    private async void OnActivated(object sender, WindowActivatedEventArgs args) { Activated -= OnActivated; var saved = ApplicationData.Current.LocalSettings.Values[ServerKey] as string; if (string.IsNullOrWhiteSpace(saved)) return; ServerInput.Text = saved; await ConnectAsync(); }
    private async void Connect_Click(object sender, RoutedEventArgs e) => await ConnectAsync();
    private void ChangeServer_Click(object sender, RoutedEventArgs e) => ShowSetup();
    private void Refresh_Click(object sender, RoutedEventArgs e) => Browser.Reload();
    private async void OpenBrowser_Click(object sender, RoutedEventArgs e) { if (Browser.Source is not null) await Launcher.LaunchUriAsync(Browser.Source); }
    private async Task ConnectAsync()
    {
        try {
            serverUri = ServerAddress.Normalize(ServerInput.Text); StatusBar.IsOpen = false; await Browser.EnsureCoreWebView2Async();
            Browser.CoreWebView2.Settings.AreDevToolsEnabled = false; Browser.CoreWebView2.Settings.IsPasswordAutosaveEnabled = false; Browser.CoreWebView2.Settings.IsGeneralAutofillEnabled = false;
            ApplicationData.Current.LocalSettings.Values[ServerKey] = serverUri.AbsoluteUri.TrimEnd('/'); Browser.Source = serverUri; Browser.Visibility = Visibility.Visible; SetupPanel.Visibility = Visibility.Collapsed;
        } catch (ArgumentException problem) { ShowSetup(problem.Message); } catch { ShowSetup("The secure browser could not start. Install or repair the Microsoft Edge WebView2 Runtime."); }
    }
    private void Navigation_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args) { if (args.SelectedItemContainer?.Tag?.ToString() is not string target) return; if (target == "change-server") { ShowSetup(); return; } if (serverUri is not null) Browser.Source = new Uri(serverUri, target); }
    private void Browser_NavigationCompleted(WebView2 sender, CoreWebView2NavigationCompletedEventArgs args) { if (!args.IsSuccess) ShowSetup(args.WebErrorStatus == CoreWebView2WebErrorStatus.CertificateIsInvalid ? "The HTTPS certificate is invalid. Fix it before signing in." : "The server could not be reached. Check its address and availability."); }
    private void ShowSetup(string? message = null) { Browser.Visibility = Visibility.Collapsed; SetupPanel.Visibility = Visibility.Visible; StatusBar.Message = message ?? string.Empty; StatusBar.IsOpen = !string.IsNullOrWhiteSpace(message); }
}
