use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

fn circle_icon(r: u8, g: u8, b: u8) -> Image<'static> {
    let size = 16u32;
    let mut data = Vec::with_capacity((size * size * 4) as usize);
    let cx = size as f32 / 2.0;
    let cy = size as f32 / 2.0;
    let radius = cx - 1.5;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - cx;
            let dy = y as f32 + 0.5 - cy;
            if (dx * dx + dy * dy).sqrt() <= radius {
                data.extend_from_slice(&[r, g, b, 255]);
            } else {
                data.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    Image::new_owned(data, size, size)
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show MavisX", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit MavisX", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(circle_icon(34, 197, 94))
        .tooltip("MavisX — All monitors up")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn update_tray(app: &AppHandle, any_down: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let (r, g, b) = if any_down { (239, 68, 68) } else { (34, 197, 94) };
        let tooltip = if any_down {
            "MavisX — Some monitors are down"
        } else {
            "MavisX — All monitors up"
        };
        let _ = tray.set_icon(Some(circle_icon(r, g, b)));
        let _ = tray.set_tooltip(Some(tooltip));
    }
}
