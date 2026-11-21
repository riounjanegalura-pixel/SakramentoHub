<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ServiceResource;
use App\Models\Service;
use App\Validation\SacramentDocuments;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    public function index()
    {
        return ServiceResource::collection(Service::all());
    }

    public function show(string $id)
    {
        $service = Service::findOrFail($id);

        return new ServiceResource($service);
    }

    /** What a service asks people to prepare, from the same list submit validation reads. */
    public function requirements(string $id)
    {
        $service = Service::findOrFail($id);

        return response()->json([
            'serviceId' => $service->id,
            'documents' => SacramentDocuments::catalogue($service->sacrament),
        ]);
    }
}
