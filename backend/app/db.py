from pymongo import MongoClient
from config import settings

client = MongoClient(settings.mongodb_uri)
db = client["studybattles"]

documents_collection = db["documents"]
trees_collection = db["trees"]
nodes_collection = db["nodes"]
sessions_collection = db["sessions"]
attempts_collection = db["attempts"]
