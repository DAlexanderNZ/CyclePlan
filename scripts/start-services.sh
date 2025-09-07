#!/bin/bash
# CyclePlan Services Startup Script
set -e

# Function to find OSM base name
find_osm_base() {
    # Look for files with .osrm. pattern (not just .osrm)
    local osrm_files=( $(find . .. -maxdepth 1 -name "*.osrm.*" | head -1) )
    
    if [ ${#osrm_files[@]} -eq 0 ]; then
        echo "ERROR: No OSRM files found. Please run the OSRM setup script first:"
        echo "  ./scripts/OSRMSetup.sh"
        exit 1
    fi
    
    # Use the first OSRM file found
    local osrm_file="${osrm_files[0]}"
    # Remove leading ./ 
    osrm_file="${osrm_file#./}"
    # Extract base name (everything before .osrm)
    local osm_base="${osrm_file%.osrm*}"
    
    echo "$osm_base"
}

# Function to update docker-compose.yml with correct OSRM path
update_docker_compose() {
    local osm_base="$1"
    local compose_file="docker-compose.yml"
    
    echo "Updating docker-compose.yml with OSRM file: $osm_base.osrm"
    
    # Use sed to replace the placeholder command with the actual OSRM file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|/data/placeholder.osrm|/data/$osm_base.osrm|g" "$compose_file"
    else
        # Linux
        sed -i "s|/data/placeholder.osrm|/data/$osm_base.osrm|g" "$compose_file"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --osrm-only      Start only OSRM service"
    echo "  --tiles-only     Start only tile server"
    echo "  --all           Start all services (default)"
    echo "  --stop          Stop all services"
    echo "  --restart       Restart all services"
    echo "  --status        Show status of services"
    echo "  --logs [service] Show logs for all services or specific service"
    echo "  --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Start all services"
    echo "  $0 --osrm-only        # Start only OSRM"
    echo "  $0 --tiles-only       # Start only tile server"
    echo "  $0 --stop             # Stop all services"
    echo "  $0 --logs osrm        # Show OSRM logs"
}

# Parse command line arguments
PROFILE="all"
ACTION="start"
LOGS_SERVICE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --osrm-only)
            PROFILE="osrm"
            shift
            ;;
        --tiles-only)
            PROFILE="tiles"
            shift
            ;;
        --all)
            PROFILE="all"
            shift
            ;;
        --stop)
            ACTION="stop"
            shift
            ;;
        --restart)
            ACTION="restart"
            shift
            ;;
        --status)
            ACTION="status"
            shift
            ;;
        --logs)
            ACTION="logs"
            if [[ $# -gt 1 && ! $2 =~ ^-- ]]; then
                LOGS_SERVICE="$2"
                shift
            fi
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
case $ACTION in
    "start")
        echo "Starting CyclePlan services..."
        
        # Find and update OSRM configuration
        OSM_BASE=$(find_osm_base)
        update_docker_compose "$OSM_BASE"
        
        echo "Using profile: $PROFILE"
        echo "OSRM file: $OSM_BASE.osrm"
        
        # Start services
        docker compose --profile "$PROFILE" up -d
        
        echo "Services started successfully!"
        
        if [[ "$PROFILE" == "all" || "$PROFILE" == "osrm" ]]; then
            echo "OSRM service available at: http://localhost:5000"
        fi
        
        if [[ "$PROFILE" == "all" || "$PROFILE" == "tiles" ]]; then
            echo "Tile server available at: http://localhost:8080"
        fi
        ;;
        
    "stop")
        echo "Stopping CyclePlan services..."
        docker compose down
        echo "Services stopped successfully!"
        ;;
        
    "restart")
        echo "Restarting CyclePlan services..."
        
        # Find and update OSRM configuration
        OSM_BASE=$(find_osm_base)
        update_docker_compose "$OSM_BASE"
        
        docker compose --profile "$PROFILE" down
        docker compose --profile "$PROFILE" up -d
        
        echo "Services restarted successfully!"
        ;;
        
    "status")
        echo "CyclePlan services status:"
        docker compose ps
        ;;
        
    "logs")
        if [[ -n "$LOGS_SERVICE" ]]; then
            echo "Showing logs for service: $LOGS_SERVICE"
            docker compose logs -f "$LOGS_SERVICE"
        else
            echo "Showing logs for all services:"
            docker compose logs -f
        fi
        ;;
esac
