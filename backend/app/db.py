from pymongo import MongoClient
from config import settings

client = MongoClient(settings.mongodb_uri)
db = client["studybattles"]

documents_collection = db["documents"]
trees_collection = db["trees"]
questions_collection = db["questions"]
nodes_collection = db["nodes"]
