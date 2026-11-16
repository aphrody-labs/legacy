//! Windows side of the WSLg link. Wayland itself (wire, state, protocols) is upstream Smithay, used by
//! `wslg-cli` on Linux; this crate carries what Smithay cannot: the Hyper-V socket address of the
//! compositor, the table mapping client dmabufs to D3D12 shared textures, and the display outputs
//! (adapters and modes) enumerated from DXGI. Work in progress: no real WSL2 session runs yet.

pub mod output;

#[cfg(windows)]
pub mod dmabuf;
#[cfg(windows)]
pub mod dxgi;
#[cfg(windows)]
pub mod hyperv;

/// Hyper-V socket service port (`0x400003E8`) the WSL2 guest uses for the Wayland display socket.
pub const WSL2_WAYLAND_VSOCK_PORT: u32 = 0x400003E8;

#[cfg(all(test, windows))]
mod tests {
    use crate::dmabuf::{D3D12SharedMappingTable, DmaBufPlane};

    #[test]
    fn dmabuf_d3d12_shared_mapping() {
        let mut table = D3D12SharedMappingTable::new();
        let planes = vec![DmaBufPlane {
            fd: 42,
            plane_index: 0,
            offset: 0,
            stride: 1920 * 4,
            modifier: 0,
        }];
        table.register_dmabuf(201, 1920, 1080, 0x34325241, 0, planes, None);
        let entry = table.get(201).expect("imported dmabuf");
        assert_eq!((entry.width, entry.height), (1920, 1080));
        assert_eq!(entry.format_fourcc, 0x34325241);
    }

    #[test]
    fn hyperv_service_id_carries_the_vsock_port() {
        let addr = crate::hyperv::SockAddrHv::new_wsl2_wayland_server();
        assert_eq!(addr.service_id.data1, crate::WSL2_WAYLAND_VSOCK_PORT);
    }
}
