//! Audio building blocks of Aphrody, one module per feature: FFT spectrum and RMS (`dsp`), the mic TCP bridge (`mic`),
//! the Polaris library indexer (`polaris`), Voicebox capture and WAV encoding (`voicebox`), the local voice loop
//! (`lu_voice`), the Jan agent tool registry (`jan_agent`) and the Rust audio crate catalog (`awesome`).

#[cfg(feature = "awesome")]
pub mod awesome;
#[cfg(feature = "dsp")]
pub mod dsp;
#[cfg(feature = "jan-agent")]
pub mod jan_agent;
#[cfg(feature = "lu-voice")]
pub mod lu_voice;
#[cfg(feature = "mic")]
pub mod mic;
#[cfg(feature = "polaris")]
pub mod polaris;
#[cfg(feature = "voicebox")]
pub mod voicebox;
