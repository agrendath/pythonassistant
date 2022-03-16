## CUSTOM PYODIDE BUILD:

1. clone pyodide repository: https://github.com/pyodide/pyodide
2. `$cd pyodide`
3. install pyodide-build `$pip install -e pyodide-build`
4. create meta.yaml file for every extra package that you want to add to pyodide: `$pyodide-build mkpkg <package-name>`
5. run `$./run_docker` in the root directory of pyodide
6. run `make` within docker if you want to build pyodide with all the packages located in /path/to/pyodide/packages; instead you can run `PYODIDE_PACKAGES="package1,package2" make` if you want to build pyodide with your custom packages 
