cmake_minimum_required(VERSION 4.5)
# Direct3D 12 capability probe. C++23 with `import std;`: stable since CMake 4.5 for every scanned
# C++20+ target (Help/release/4.5.rst), Ninja generators only, MSVC 14.36+ (cmake-cxxmodules(7)).
# Dependencies: vcpkg in manifest mode (vcpkg.json, vcpkg-configuration.json), aphrody-labs ports as overlay.
project(nt_gpu_probe LANGUAGES CXX)

if(NOT WIN32)
  message(STATUS "nt-gpu-probe: Direct3D 12 only exists on Windows, target ignored")
  return()
endif()

find_package(directx-headers CONFIG REQUIRED) # 1.620.2 = Agility SDK 1.620.2
find_package(wil CONFIG REQUIRED)

add_executable(nt-gpu-probe probe.cpp)
target_compile_features(nt-gpu-probe PRIVATE cxx_std_23)
set_target_properties(nt-gpu-probe PROPERTIES CXX_SCAN_FOR_MODULES ON)
target_link_libraries(nt-gpu-probe PRIVATE Microsoft::DirectX-Headers WIL::WIL d3d12 dxgi)
if(MSVC)
  # Target options: CMake forwards them to the synthetic target that compiles the BMI of `std` (cmake-cxxmodules(7)).
  target_compile_options(nt-gpu-probe PRIVATE /W4 /WX /permissive- /guard:cf /utf-8)
  target_link_options(nt-gpu-probe PRIVATE /CETCOMPAT /DYNAMICBASE /GUARD:CF)
endif()

# Agility SDK: D3D12Core.dll in <exe>\D3D12\ (D3D12SDKPath export). NuGet package fetched by `just tools`.
string(TOLOWER "${CMAKE_CXX_COMPILER_ARCHITECTURE_ID}" NT_AGILITY_ARCH) # x64 | arm64
set(NT_AGILITY_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../dxc/microsoft.direct3d.d3d12/build/native/bin/${NT_AGILITY_ARCH}")
add_custom_command(TARGET nt-gpu-probe POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_FILE_DIR:nt-gpu-probe>/D3D12"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${NT_AGILITY_DIR}/D3D12Core.dll" "$<TARGET_FILE_DIR:nt-gpu-probe>/D3D12/"
  VERBATIM)
