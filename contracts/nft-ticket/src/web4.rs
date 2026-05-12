use super::*;

#[near]
impl Contract {
    pub fn web4_get(&self, request: Web4Request) -> Web4Response {
        match &self.web4_static_url {
            Some(base_url) => {
                // Strip query string from path — near.page gateway may include it
                // (e.g. MetaMask requests "/favicon.ico?favicon.0b3bf435.ico")
                let clean_path = match request.path.find('?') {
                    Some(idx) => &request.path[..idx],
                    None => &request.path,
                };

                let path = if clean_path == "/" {
                    "/index.html".to_string()
                } else if clean_path.ends_with('/') {
                    // Trailing slash → directory → serve index.html
                    format!("{}index.html", clean_path)
                } else if !Self::path_has_extension(clean_path) {
                    // No file extension → route path → serve index.html
                    format!("{}/index.html", clean_path)
                } else {
                    clean_path.to_string()
                };
                let content_type = Self::detect_content_type(&path).to_string();
                let body_url = format!("{}{}", base_url, path);
                Web4Response::BodyUrl {
                    content_type,
                    body_url,
                }
            }
            None => {
                let html = b"<!DOCTYPE html><html><head><title>YouTick</title></head><body><h1>YouTick</h1><p>Web4 static URL not configured. Owner must call web4_set_static_url.</p></body></html>";
                Web4Response::Body {
                    content_type: "text/html; charset=utf-8".to_string(),
                    body: Base64VecU8::from(html.to_vec()),
                }
            }
        }
    }

    /// Check if the last segment of a path contains a file extension (has a dot).
    fn path_has_extension(path: &str) -> bool {
        match path.rsplit('/').next() {
            Some(segment) => segment.contains('.'),
            None => false,
        }
    }

    /// Owner-only: Set the NEARFS static URL (e.g., "/ipfs/CID")
    pub fn web4_set_static_url(&mut self, url: String) {
        self.assert_owner();
        self.assert_not_paused();
        self.web4_set_static_url_timelocked(url);
    }

    pub(crate) fn web4_set_static_url_timelocked(&mut self, url: String) {
        self.web4_static_url = Some(url);
    }

    /// View: Get the current web4 static URL
    pub fn web4_get_static_url(&self) -> Option<String> {
        self.web4_static_url.clone()
    }

    /// Internal helper: detect content type from file extension
    fn detect_content_type(path: &str) -> &'static str {
        let path_lower = path.to_lowercase();
        if path_lower.ends_with(".html") || path_lower.ends_with(".htm") {
            "text/html; charset=utf-8"
        } else if path_lower.ends_with(".js") || path_lower.ends_with(".mjs") {
            "application/javascript"
        } else if path_lower.ends_with(".css") {
            "text/css"
        } else if path_lower.ends_with(".json") {
            "application/json"
        } else if path_lower.ends_with(".png") {
            "image/png"
        } else if path_lower.ends_with(".jpg") || path_lower.ends_with(".jpeg") {
            "image/jpeg"
        } else if path_lower.ends_with(".gif") {
            "image/gif"
        } else if path_lower.ends_with(".svg") {
            "image/svg+xml"
        } else if path_lower.ends_with(".ico") {
            "image/x-icon"
        } else if path_lower.ends_with(".woff") {
            "font/woff"
        } else if path_lower.ends_with(".woff2") {
            "font/woff2"
        } else if path_lower.ends_with(".ttf") {
            "font/ttf"
        } else if path_lower.ends_with(".xml") {
            "application/xml"
        } else if path_lower.ends_with(".txt") {
            // Next.js RSC data files use .txt extension but need text/x-component
            if path_lower.contains("__next.") || path_lower.contains("index.txt") {
                "text/x-component"
            } else {
                "text/plain"
            }
        } else if path_lower.ends_with(".wasm") {
            "application/wasm"
        } else if path_lower.ends_with(".webp") {
            "image/webp"
        } else if path_lower.ends_with(".map") {
            "application/json"
        } else {
            "application/octet-stream"
        }
    }
}
