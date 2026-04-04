from app.connectors.examples.amos_connector import AmosConnector
from app.connectors.examples.doc_hub_connector import DocumentHubConnector
from app.connectors.examples.flight_ops_connector import FlightOpsConnector
from app.connectors.examples.sap_spares_connector import SapSparesConnector
from app.sdk.connector_sdk import registry

registry.register(AmosConnector)
registry.register(SapSparesConnector)
registry.register(FlightOpsConnector)
registry.register(DocumentHubConnector)

__all__ = [
    "AmosConnector",
    "SapSparesConnector",
    "FlightOpsConnector",
    "DocumentHubConnector",
]
