# aphrody-labs port: portfile of microsoft/vcpkg@177e8175 (ports/wil) without cpp14.patch (nt builds as C++23),
# source = fork pinned by commit; WIL_BUILD_PACKAGING=OFF (avoids downloading nuget.exe at configuration).
vcpkg_from_github(
    OUT_SOURCE_PATH SOURCE_PATH
    REPO aphrody-labs/wil
    REF abb1bd3509b6e5db53ba29738a4180d857adfd40 # master 2026-11-07
    SHA512 ac375a81ef7a35c96b8dc0ec3acd030613f2da2c4118c0c3b9cf98157ec1f65db9e579c3a7ffc7ea97c2b59161893c3b144f41881d90c444080251eb7c51c4f1
    HEAD_REF master
)

# Headers only: a single configuration is enough.
set(VCPKG_BUILD_TYPE release)

vcpkg_cmake_configure(
    SOURCE_PATH "${SOURCE_PATH}"
    OPTIONS -DWIL_BUILD_TESTS=OFF -DWIL_BUILD_PACKAGING=OFF
)

vcpkg_cmake_install()
vcpkg_cmake_config_fixup(CONFIG_PATH share/cmake/WIL)

file(REMOVE_RECURSE "${CURRENT_PACKAGES_DIR}/debug")
file(INSTALL "${SOURCE_PATH}/natvis/" DESTINATION "${CURRENT_PACKAGES_DIR}/share/${PORT}/natvis")
vcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")
