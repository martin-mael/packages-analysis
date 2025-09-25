#!/bin/bash
# filepath: analyze-dependencies.sh
#
# Analyse des dépendances JavaScript/TypeScript depuis GitHub
# 
# Usage:
#   ./analyse-dependencies.sh [branche]
#
# Exemples:
#   ./analyse-dependencies.sh dev       # Analyse la branche dev
#   ./analyse-dependencies.sh master    # Analyse la branche master

set -e

# Configuration
OUTPUT_FILE="$HOME/Documents/Apps/dependencies-analysis-$(date +%Y%m%d-%H%M%S).csv"

# Liste des repos à analyser
REPOS=(
    "training.web"
    "crm.web"
    "portal.web"
    "bridge-admin.web"
    "marketing.web"
    "store.web"
    "task-manager"
    "document-manager.web"
    "pdp-gateway.web"
    "messenger"
    "simulators.web"
)

# Variable pour indiquer qu'on utilise GitHub
USE_GITHUB=true

# Branche à analyser (par défaut master)
TARGET_BRANCH="master"

# Répertoire temporaire pour le cache des package.json
GITHUB_CACHE_DIR=""

# Fonction pour récupérer tous les package.json depuis GitHub
fetch_all_package_json_from_github() {
    local npm_token=""
    if [[ -f "$HOME/.npmrc" ]]; then
        npm_token=$(grep -E "//npm\.pkg\.github\.com/:_authToken=" "$HOME/.npmrc" 2>/dev/null | cut -d'=' -f2)
    fi
    
    if [[ -n "$npm_token" ]]; then
        echo "📦 Récupération de tous les package.json depuis GitHub (branche: $TARGET_BRANCH)..."
        
        # Créer un répertoire temporaire pour le cache
        GITHUB_CACHE_DIR=$(mktemp -d)
        
        for repo in "${REPOS[@]}"; do
            echo "  🔍 Récupération $repo/package.json..."
            local package_json_content=$(curl -s -H "Authorization: Bearer $npm_token" \
                -H "Accept: application/vnd.github.v3+json" \
                "https://api.github.com/repos/fulll/$repo/contents/package.json?ref=$TARGET_BRANCH" | \
                jq -r '.content // empty' 2>/dev/null | base64 -d 2>/dev/null)
            
            if [[ -n "$package_json_content" ]]; then
                echo "$package_json_content" > "$GITHUB_CACHE_DIR/$repo.json"
                echo "    ✅ $repo/package.json récupéré (branche: $TARGET_BRANCH)"
            else
                echo "    ❌ Impossible de récupérer $repo/package.json (branche: $TARGET_BRANCH)"
                # Essayer avec master si main échoue
                if [[ "$TARGET_BRANCH" == "main" ]]; then
                    echo "    🔄 Tentative avec la branche master..."
                    package_json_content=$(curl -s -H "Authorization: Bearer $npm_token" \
                        -H "Accept: application/vnd.github.v3+json" \
                        "https://api.github.com/repos/fulll/$repo/contents/package.json?ref=master" | \
                        jq -r '.content // empty' 2>/dev/null | base64 -d 2>/dev/null)
                    
                    if [[ -n "$package_json_content" ]]; then
                        echo "$package_json_content" > "$GITHUB_CACHE_DIR/$repo.json"
                        echo "    ✅ $repo/package.json récupéré (branche: master)"
                    else
                        echo "    ❌ Impossible de récupérer $repo/package.json (master non plus)"
                        touch "$GITHUB_CACHE_DIR/$repo.json"  # Créer un fichier vide
                    fi
                # Essayer avec main si master échoue
                elif [[ "$TARGET_BRANCH" == "master" ]]; then
                    echo "    🔄 Tentative avec la branche main..."
                    package_json_content=$(curl -s -H "Authorization: Bearer $npm_token" \
                        -H "Accept: application/vnd.github.v3+json" \
                        "https://api.github.com/repos/fulll/$repo/contents/package.json?ref=main" | \
                        jq -r '.content // empty' 2>/dev/null | base64 -d 2>/dev/null)
                    
                    if [[ -n "$package_json_content" ]]; then
                        echo "$package_json_content" > "$GITHUB_CACHE_DIR/$repo.json"
                        echo "    ✅ $repo/package.json récupéré (branche: main)"
                    else
                        echo "    ❌ Impossible de récupérer $repo/package.json (main non plus)"
                        touch "$GITHUB_CACHE_DIR/$repo.json"  # Créer un fichier vide
                    fi
                else
                    touch "$GITHUB_CACHE_DIR/$repo.json"  # Créer un fichier vide
                fi
            fi
        done
        
        echo "✅ Tous les package.json récupérés depuis GitHub"
        return 0
    else
        echo "❌ Token npm non disponible"
        return 1
    fi
}

# Fonction pour nettoyer le cache
cleanup_github_cache() {
    if [[ -n "$GITHUB_CACHE_DIR" && -d "$GITHUB_CACHE_DIR" ]]; then
        rm -rf "$GITHUB_CACHE_DIR"
    fi
}

# Fonction pour extraire la version d'un package depuis GitHub
get_package_version() {
    local repo_name="$1"
    local package_name="$2"
    
    # Utiliser le cache GitHub
    local cache_file="$GITHUB_CACHE_DIR/$repo_name.json"
    
    if [[ -f "$cache_file" && -s "$cache_file" ]]; then
        local version=$(jq -r "(.dependencies // {}) | .[\"$package_name\"] // empty" "$cache_file" 2>/dev/null)
        if [[ "$version" != "null" && "$version" != "" ]]; then
            echo "$version" | sed 's/^[\^~]*//'
        else
            echo "-"
        fi
    else
        echo "-"
    fi
}

# Fonction pour obtenir la version latest d'un package
get_latest_version() {
    local package_name="$1"
    
    # Pour les packages @fulll, utiliser le token npm du .npmrc
    if [[ "$package_name" == @fulll/* ]]; then
        # Extraire le token npm du .npmrc
        local npm_token=""
        if [[ -f "$HOME/.npmrc" ]]; then
            npm_token=$(grep -E "//npm\.pkg\.github\.com/:_authToken=" "$HOME/.npmrc" 2>/dev/null | cut -d'=' -f2)
        fi
        
        if [[ -n "$npm_token" ]]; then
            # Utiliser l'API GitHub Packages avec le token npm
            local package_encoded=$(echo "$package_name" | sed 's/@/%40/g' | sed 's/\//%2F/g')
            local latest=$(curl -s -H "Authorization: Bearer $npm_token" \
                -H "Accept: application/vnd.github.v3+json" \
                "https://api.github.com/orgs/fulll/packages/npm/${package_name#@fulll/}/versions" | \
                jq -r '.[0].name // empty' 2>/dev/null)
            
            if [[ -n "$latest" && "$latest" != "null" ]]; then
                echo "$latest" | sed 's/^v//'
            else
                # Fallback: essayer avec npm view si configuré
                local npm_version=$(npm view "$package_name" version 2>/dev/null)
                if [[ -n "$npm_version" ]]; then
                    echo "$npm_version"
                else
                    echo "N/A"
                fi
            fi
        else
            echo "N/A"
        fi
    else
        # Pour les autres packages, utiliser npm registry public
        local latest=$(curl -s "https://registry.npmjs.org/$package_name/latest" | \
            jq -r '.version // empty' 2>/dev/null)
        if [[ -n "$latest" && "$latest" != "null" ]]; then
            echo "$latest"
        else
            echo "N/A"
        fi
    fi
}

# Fonction pour collecter toutes les dépendances des projets depuis GitHub
collect_all_dependencies() {
    local temp_file=$(mktemp)
    
    for repo in "${REPOS[@]}"; do
        # Utiliser le cache GitHub
        local cache_file="$GITHUB_CACHE_DIR/$repo.json"
        if [[ -f "$cache_file" && -s "$cache_file" ]]; then
            jq -r '(.dependencies // {}) | keys[]' "$cache_file" 2>/dev/null >> "$temp_file"
        fi
    done
    
    # Trier et dédupliquer
    sort "$temp_file" | uniq
    rm "$temp_file"
}

# Fonction pour analyser les dépendances
analyze_dependencies() {
    echo "📊 Analyse des dépendances..."
    
    # Collecter toutes les dépendances uniques des projets
    echo "🔍 Collecte de toutes les dépendances..."
    local all_deps=$(collect_all_dependencies)
    local total_deps=$(echo "$all_deps" | wc -l | tr -d ' ')
    echo "📦 $total_deps dépendances uniques trouvées"
    
    # En-tête CSV avec BOM pour Excel
    printf '\xEF\xBB\xBF' > "$OUTPUT_FILE"
    echo "Package,Latest,Training,CRM,Portal,Admin,Marketing,Store,Tasks,Document,PA,Messenger,Simulateur" >> "$OUTPUT_FILE"
    
    # Analyser chaque package trouvé
    echo "$all_deps" | while read -r package; do
        if [[ -n "$package" ]]; then
            echo "🔍 Analyse de $package..."
            local latest_version=$(get_latest_version "$package")
            
            # Échapper les guillemets et virgules dans les valeurs
            package_escaped=$(echo "$package" | sed 's/"/""""/g')
            latest_escaped=$(echo "$latest_version" | sed 's/"/""""/g')
            
            local row="\"$package_escaped\",\"$latest_escaped\""
            
            for repo in "${REPOS[@]}"; do
                local version=$(get_package_version "$repo" "$package")
                version_escaped=$(echo "$version" | sed 's/"/""""/g')
                row+=",\"$version_escaped\""
            done
            
            echo "$row" >> "$OUTPUT_FILE"
        fi
    done
    
    echo "📊 Analyse terminée - $total_deps dépendances analysées"
}


# Fonction principale
main() {
    echo "🚀 Démarrage de l'analyse des dépendances depuis GitHub..."
    echo "📄 Fichier de sortie: $OUTPUT_FILE"
    echo ""
    
    # Vérifier si une branche est passée en paramètre
    if [[ -n "$1" ]]; then
        TARGET_BRANCH="$1"
        echo "🌿 Branche spécifiée en paramètre: $TARGET_BRANCH"
    fi
    
    # Vérifier jq seulement
    if ! command -v jq >/dev/null 2>&1; then
        echo "❌ jq n'est pas installé. Installation:"
        echo "   brew install jq"
        exit 1
    fi
    
    # Vérifier la configuration npm pour les packages @fulll
    local npm_token=""
    if [[ -f "$HOME/.npmrc" ]]; then
        npm_token=$(grep -E "//npm\.pkg\.github\.com/:_authToken=" "$HOME/.npmrc" 2>/dev/null | cut -d'=' -f2)
    fi
    
    if [[ -n "$npm_token" ]]; then
        echo "✅ Token npm configuré pour GitHub Packages"
        
        # Choix de la branche seulement si pas passée en paramètre
        if [[ -z "$1" ]]; then
            echo ""
            echo "🌿 Quelle branche voulez-vous analyser ?"
            echo "1) master (par défaut)"
            echo "2) dev"
            echo ""
            read -p "Votre choix (1-2, défaut=1): " branch_choice
            
            case "$branch_choice" in
                2)
                    TARGET_BRANCH="dev"
                    ;;
            esac
        fi
        
        echo "📋 Branche sélectionnée: $TARGET_BRANCH"
        echo "📋 Mode GitHub - récupération en lot des package.json"
        
        # Récupérer tous les package.json en une fois
        if ! fetch_all_package_json_from_github; then
            echo "❌ Échec de la récupération depuis GitHub"
            exit 1
        fi
    else
        echo "❌ Token npm non trouvé dans ~/.npmrc"
        echo "   Pour configurer: npm login --scope=@fulll --auth-type=legacy --registry=https://npm.pkg.github.com"
        exit 1
    fi
    
    echo "📋 Analyse depuis GitHub - Branche: $TARGET_BRANCH - Repos: ${REPOS[*]}"
    echo ""
    
    # Analyser les dépendances
    analyze_dependencies
    
    echo ""
    echo "✅ Analyse terminée!"
    echo "📄 Fichier CSV sauvegardé dans: $OUTPUT_FILE"
    echo ""
    echo "🔍 Pour ouvrir le fichier CSV:"
    echo "   open $OUTPUT_FILE"
    echo ""
    echo "📊 Pour l'ouvrir directement dans Excel:"
    echo "   open -a 'Microsoft Excel' $OUTPUT_FILE"
    echo ""
    echo "📋 Pour l'ouvrir dans Numbers (Mac):"
    echo "   open -a 'Numbers' $OUTPUT_FILE"
    
    # Nettoyer le cache GitHub
    cleanup_github_cache
}

# Nettoyage en cas d'interruption
trap cleanup_github_cache EXIT


# Exécution
main "$@"
