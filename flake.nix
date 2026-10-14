{
  description = "Streamstar: drift-adaptive federated streaming analytics in Go";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.buildGoModule {
            pname = "streamstar";
            version = "0.1.0";
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = path: type:
                let name = baseNameOf path;
                in !(builtins.elem name [ ".git" ".firecrawl" ".direnv" "bin" "data" "results" "result" ]);
            };
            vendorHash = "sha256-41Oj/HbQlKawCa3K/1D4tkm91STRkPW32UXUkNfQe+4=";
            subPackages = [ "cmd/streamstar" ];
          };
        });
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/streamstar";
        };
      });
      checks = forAllSystems (system: {
        build-and-tests = self.packages.${system}.default;
      });
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in rec {
          default = pkgs.mkShell {
            packages = with pkgs; [ go gopls gotools go-tools git gh gnumake curl jq python3 direnv nix-direnv (docker_29.override { clientOnly = true; }) docker-compose ];
            shellHook = ''
              export STREAMSTAR_DEV=1
              echo "Streamstar · make run | make test | make experiment"
            '';
          };
          kafka = pkgs.mkShell {
            inputsFrom = [ default ];
            packages = [ pkgs.apacheKafka ];
          };
        });
    };
}
