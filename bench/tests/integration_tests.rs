use stack_bench::hardware::{get_qpc_counter, get_qpc_frequency};
use zerocopy::{FromBytes, IntoBytes};

#[test]
fn test_qpc_timer_monotonicity() {
    assert!(get_qpc_frequency() > 0, "QPC frequency must be positive");

    let t0 = get_qpc_counter();
    std::thread::sleep(std::time::Duration::from_millis(1));
    let t1 = get_qpc_counter();
    assert!(t1 > t0, "QPC counter must be strictly monotonic");
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, zerocopy::FromBytes, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout)]
struct TestRecord {
    id: u64,
    value: f64,
}

#[test]
fn test_zerocopy_ref_from_bytes() {
    let records = [
        TestRecord { id: 1, value: 1.23 },
        TestRecord { id: 2, value: 4.56 },
    ];
    let bytes = records.as_bytes();
    let slice = <[TestRecord]>::ref_from_bytes(bytes).expect("zerocopy ref_from_bytes failed");
    assert_eq!(slice.len(), 2);
    assert_eq!(slice[0].id, 1);
    assert_eq!(slice[1].id, 2);
}
