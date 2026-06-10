from fastapi import APIRouter, UploadFile, File
import shutil
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, func, case
import logging
import os
import threading
import subprocess
import platform
import time
from pathlib import Path
from typing import Optional, Any
import uuid
import re

from app.db.base import Session
from app.db.models import *
from app.utils.people_utils import *
from app.services.people_service import *

logger = logging.getLogger(__name__)


class PeopleService:
    def __init__(self, db):
        self.db = db
