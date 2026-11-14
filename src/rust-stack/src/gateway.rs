use crate::auth::{
    ApiKeyCreateRequest, AuthEngine, OAuthAuthorizeRequest, OAuthTokenRequest,
    PasskeyChallengeRequest, SignInEmailRequest, SignUpEmailRequest,
};
use crate::shadcn_rs::{REGISTRY_COMPONENTS, RenderTarget, default_primitive_for_slug};
use crate::webui::{
    AppendMessageRequest, CreateConversationRequest, PROMPT_LIBRARY, WebUiStore,
    render_workspace_html,
};
use axum::{
    Json, Router,
    extract::{Path as AxumPath, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Clone)]
pub struct GatewayState {
    pub auth: AuthEngine,
    pub webui: WebUiStore,
}

impl GatewayState {
    pub fn new(auth: AuthEngine, webui: WebUiStore) -> Self {
        Self { auth, webui }
    }
}


pub fn build_router(state: GatewayState) -> Router {
    Router::new()
        // Open-WebUI native workspace
        .route("/", get(handle_webui_index))
        .route("/chat", get(handle_webui_index))
        .route(
            "/api/webui/conversations",
            get(handle_webui_list_convs).post(handle_webui_create_conv),
        )
        .route(
            "/api/webui/conversations/{id}",
            get(handle_webui_get_messages),
        )
        .route(
            "/api/webui/conversations/{id}/messages",
            post(handle_webui_append_message),
        )
        .route("/api/webui/prompts", get(handle_webui_prompts))
        .route("/health", get(handle_health))
        // Better-Auth REST-compatible endpoints
        .route("/api/auth/sign-up/email", post(handle_auth_signup))
        .route("/api/auth/sign-in/email", post(handle_auth_signin))
        .route("/api/auth/get-session", get(handle_auth_get_session))
        .route("/api/auth/sign-out", post(handle_auth_signout))
        .route(
            "/api/auth/oauth2/authorize",
            post(handle_auth_oauth_authorize),
        )
        .route("/api/auth/oauth2/token", post(handle_auth_oauth_token))
        .route("/api/auth/jwks", get(handle_auth_jwks))
        .route("/api/auth/api-key/create", post(handle_auth_apikey_create))
        .route(
            "/api/auth/passkey/challenge",
            post(handle_auth_passkey_challenge),
        )
        // shadcn_rs component registry endpoints
        .route("/api/ui/components", get(handle_ui_components))
        .route("/api/ui/components/{slug}", get(handle_ui_render_component))
        .with_state(state)
}

pub async fn serve_http(bind_addr: &str, state: GatewayState) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("failed to bind {bind_addr}: {e}"))?;
    let app = build_router(state);
    axum::serve(listener, app)
        .await
        .map_err(|e| format!("gateway server error: {e}"))
}

async fn handle_webui_index() -> Html<String> {
    Html(render_workspace_html())
}

async fn handle_webui_prompts() -> Json<Value> {
    Json(json!({ "prompts": PROMPT_LIBRARY }))
}

async fn handle_webui_list_convs(State(st): State<GatewayState>) -> Response {
    match st.webui.list_conversations() {
        Ok(list) => Json(list).into_response(),
        Err(e) => json_err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn handle_webui_create_conv(
    State(st): State<GatewayState>,
    Json(req): Json<CreateConversationRequest>,
) -> Response {
    match st
        .webui
        .create_conversation(&req.title, req.model.as_deref())
    {
        Ok(conv) => (StatusCode::CREATED, Json(conv)).into_response(),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn handle_webui_get_messages(
    State(st): State<GatewayState>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    match st.webui.list_messages(&id) {
        Ok(msgs) => Json(msgs).into_response(),
        Err(e) => json_err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn handle_webui_append_message(
    State(st): State<GatewayState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<AppendMessageRequest>,
) -> Response {
    let model = req.model.as_deref().unwrap_or("sovereign/ring3-local");
    match st.webui.append_message(&id, &req.role, &req.content, model) {
        Ok(msg) => (StatusCode::CREATED, Json(msg)).into_response(),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn handle_health(State(_st): State<GatewayState>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "stack": "rust-stack",
        "edition": "2024",
        "abi_version": 1,
    }))
}

// --- Better-Auth Compatible Handlers ---

async fn handle_auth_signup(
    State(st): State<GatewayState>,
    headers: HeaderMap,
    Json(req): Json<SignUpEmailRequest>,
) -> Response {
    let ua = header_str(&headers, header::USER_AGENT);
    match st.auth.sign_up_email(req, Some("127.0.0.1".into()), ua) {
        Ok(env) => session_response_with_cookie(StatusCode::CREATED, env),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn handle_auth_signin(
    State(st): State<GatewayState>,
    headers: HeaderMap,
    Json(req): Json<SignInEmailRequest>,
) -> Response {
    let ua = header_str(&headers, header::USER_AGENT);
    match st.auth.sign_in_email(req, Some("127.0.0.1".into()), ua) {
        Ok(env) => session_response_with_cookie(StatusCode::OK, env),
        Err(e) => json_err(StatusCode::UNAUTHORIZED, &e),
    }
}

async fn handle_auth_get_session(State(st): State<GatewayState>, headers: HeaderMap) -> Response {
    let Some(token) = extract_session_token(&headers) else {
        return Json(json!({ "session": null, "user": null })).into_response();
    };
    match st.auth.get_session(&token) {
        Ok(Some(env)) => Json(env).into_response(),
        Ok(None) => Json(json!({ "session": null, "user": null })).into_response(),
        Err(e) => json_err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn handle_auth_signout(
    State(st): State<GatewayState>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> Response {
    let token = extract_session_token(&headers)
        .or_else(|| body.and_then(|b| b.get("token").and_then(Value::as_str).map(str::to_string)));
    let Some(tok) = token else {
        return Json(json!({ "success": false })).into_response();
    };
    match st.auth.sign_out(&tok) {
        Ok(removed) => {
            let mut resp = Json(json!({ "success": removed })).into_response();
            resp.headers_mut().insert(
                header::SET_COOKIE,
                HeaderValue::from_static(
                    "better-auth.session_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
                ),
            );
            resp
        }
        Err(e) => json_err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn handle_auth_oauth_authorize(
    State(st): State<GatewayState>,
    Json(req): Json<OAuthAuthorizeRequest>,
) -> Response {
    match st.auth.oauth2_authorize(req) {
        Ok(res) => Json(res).into_response(),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn handle_auth_oauth_token(
    State(st): State<GatewayState>,
    Json(req): Json<OAuthTokenRequest>,
) -> Response {
    match st.auth.oauth2_token(req) {
        Ok(res) => Json(res).into_response(),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn handle_auth_jwks(State(st): State<GatewayState>) -> Json<crate::auth::JwksDocument> {
    Json(st.auth.jwks())
}

async fn handle_auth_apikey_create(
    State(st): State<GatewayState>,
    Json(req): Json<ApiKeyCreateRequest>,
) -> Response {
    match st.auth.create_api_key(req) {
        Ok(issued) => (StatusCode::CREATED, Json(issued)).into_response(),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn handle_auth_passkey_challenge(
    State(st): State<GatewayState>,
    Json(req): Json<PasskeyChallengeRequest>,
) -> Response {
    match st.auth.generate_passkey_challenge(req) {
        Ok(ch) => Json(ch).into_response(),
        Err(e) => json_err(StatusCode::BAD_REQUEST, &e),
    }
}

// --- shadcn_rs Registry Handlers ---

#[derive(Deserialize)]
struct UiQuery {
    target: Option<String>,
}

async fn handle_ui_components() -> Json<Value> {
    Json(json!({
        "registry": "shadcn_rs",
        "theme": "aphrody-oklch-m3-fluent2",
        "targets": ["html", "dioxus", "gpui"],
        "components": REGISTRY_COMPONENTS
    }))
}

async fn handle_ui_render_component(
    AxumPath(slug): AxumPath<String>,
    Query(q): Query<UiQuery>,
) -> Response {
    let target_str = q.target.as_deref().unwrap_or("html");
    let target = match RenderTarget::parse(target_str) {
        Ok(t) => t,
        Err(e) => return json_err(StatusCode::BAD_REQUEST, &e),
    };
    match default_primitive_for_slug(&slug) {
        Ok(prim) => Json(json!({
            "slug": slug,
            "target": target_str,
            "code": prim.render(target)
        }))
        .into_response(),
        Err(e) => json_err(StatusCode::NOT_FOUND, &e),
    }
}

fn session_response_with_cookie(
    status: StatusCode,
    env: crate::auth::AuthSessionEnvelope,
) -> Response {
    let cookie = format!(
        "better-auth.session_token={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800",
        env.token
    );
    let mut resp = (status, Json(env)).into_response();
    if let Ok(hv) = HeaderValue::from_str(&cookie) {
        resp.headers_mut().insert(header::SET_COOKIE, hv);
    }
    resp
}

fn extract_session_token(headers: &HeaderMap) -> Option<String> {
    if let Some(authz) = header_str(headers, header::AUTHORIZATION) {
        if let Some(b) = authz.strip_prefix("Bearer ") {
            return Some(b.trim().to_string());
        }
    }
    if let Some(cookie_hdr) = header_str(headers, header::COOKIE) {
        for part in cookie_hdr.split(';') {
            let kv = part.trim();
            if let Some(val) = kv.strip_prefix("better-auth.session_token=")
                && !val.is_empty()
            {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn header_str(headers: &HeaderMap, name: header::HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

fn json_err(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({ "error": { "message": msg } }))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn gateway_end_to_end_http_test() {
        let auth = AuthEngine::open_in_memory(b"gateway-test-hmac-secret-32bytes").unwrap();
        let webui = WebUiStore::open_in_memory().unwrap();
        let state = GatewayState::new(auth, webui);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = build_router(state);
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        let base = format!("http://{addr}");

        tokio::task::spawn_blocking(move || {
            let health: Value = ureq::get(&format!("{base}/health"))
                .call()
                .unwrap()
                .into_body()
                .read_json()
                .unwrap();
            assert_eq!(health["status"], "ok");

            let signup: Value = ureq::post(&format!("{base}/api/auth/sign-up/email"))
                .send_json(json!({
                    "email": "ada@sovereign.local",
                    "password": "ada-lovelace-rust-2024"
                }))
                .unwrap()
                .into_body()
                .read_json()
                .unwrap();
            let tok = signup["token"].as_str().unwrap();
            let sess: Value = ureq::get(&format!("{base}/api/auth/get-session"))
                .header("Authorization", &format!("Bearer {tok}"))
                .call()
                .unwrap()
                .into_body()
                .read_json()
                .unwrap();
            assert_eq!(sess["user"]["email"], "ada@sovereign.local");

            let html = ureq::get(&format!("{base}/"))
                .call()
                .unwrap()
                .into_body()
                .read_to_string()
                .unwrap();
            assert!(html.contains("rust-stack | Aphrody AI Workspace"));
        })
        .await
        .unwrap();
    }
}
