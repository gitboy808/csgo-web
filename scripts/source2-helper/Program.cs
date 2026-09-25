using System.Numerics;
using System.Text.Json;
using ValveResourceFormat.NavMesh;
using ValveResourceFormat.IO;
#if SOURCE2_CURRENT
using ValvePak;
#else
using SteamDatabase.ValvePak;
#endif

if(args.Length==4&&(args[0]=="deps"||args[0]=="deps-materials"))
{
    using var package=new Package();package.Read(args[1]);
    using var loader=new GameFileLoader(package,Path.GetFullPath(args[1]));
    var queue=new Queue<string>(JsonSerializer.Deserialize<string[]>(File.ReadAllText(args[2]))!);
    var visited=new HashSet<string>();var missing=new List<string>();
    while(queue.TryDequeue(out var name))
    {
        if(!name.EndsWith("_c"))name+="_c";
        if(!visited.Add(name)||name.EndsWith(".vtex_c")||name.EndsWith(".vsnd_c"))continue;
        try
        {
            var resource=loader.LoadFile(name);if(resource==null){missing.Add(name);continue;}
            foreach(var reference in resource.ExternalReferences?.ResourceRefInfoList??[])
            {
                if(args[0]=="deps-materials"&&(reference.Name.EndsWith(".vnmgraph")||reference.Name.EndsWith(".vagrp")))continue;
                if(new[]{".vmat",".vtex",".vmdl",".vnmclip",".vnmskel",".vnmgraph",".vanim",".vagrp",".vsnd"}.Any(reference.Name.EndsWith))queue.Enqueue(reference.Name);
            }
        }
        catch{missing.Add(name);}
    }
    File.WriteAllText(args[3],JsonSerializer.Serialize(new{files=visited.Order(),missing}));
    Console.WriteLine($"Dependencies: {visited.Count}; unreadable: {missing.Count}");return 0;
}
if(args.Length==4&&args[0]=="sprite")
{
    using var package=new Package();package.Read(args[1]);
    using var loader=new GameFileLoader(package,Path.GetFullPath(args[1]));
    using var resource=loader.LoadFile(args[2])??throw new FileNotFoundException(args[2]);
    var texture=(ValveResourceFormat.ResourceTypes.Texture)resource.DataBlock!;
    File.WriteAllText(args[3],JsonSerializer.Serialize(texture.GetSpriteSheetData(),new JsonSerializerOptions{IncludeFields=true}));return 0;
}
if(args.Length>=4&&(args[0]=="export"||args[0]=="export-animated"||args[0]=="export-character"||args[0]=="export-character-poses"||args[0]=="clip-events"))
{
    using var package=new Package();package.Read(args[1]);
    using var loader=new GameFileLoader(package,Path.GetFullPath(args[1]));
    using var resource=loader.LoadFile(args[2])??throw new FileNotFoundException(args[2]);
    var exporter=new GltfModelExporter(loader){ExportMaterials=args[0]!="export-character-poses",ExportExtras=true,AdaptTextures=true,SatelliteImages=true,ExportAnimations=args[0]!="export",ComposeAdditiveAnimations=false,ProgressReporter=new Progress<string>(Console.WriteLine)};
    if(args[0]=="export-character"||args[0]=="export-character-poses")
    {
        // The pinned VRF exporter retargets AG2 clips onto the model skeleton. Its
        // public API loads every graph; seed the cache with our explicit clip set
        // instead, avoiding unrelated first-person/UI skeletons and animations.
        var animations=new List<ValveResourceFormat.ResourceTypes.ModelAnimation.Animation>();
        foreach(var path in JsonSerializer.Deserialize<string[]>(File.ReadAllText(args[4]))!)
        {
            var clipResource=loader.LoadFile(path)??throw new FileNotFoundException(path);
            var selectedClip=clipResource.DataBlock as ValveResourceFormat.ResourceTypes.ModelAnimation2.AnimationClip??throw new InvalidDataException(path);
            animations.Add(new ValveResourceFormat.ResourceTypes.ModelAnimation.ClipAnimation(selectedClip));
        }
        var cache=typeof(ValveResourceFormat.ResourceTypes.Model).GetField("CachedAnimations",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance)??throw new MissingFieldException("VRF animation cache changed");
        cache.SetValue(resource.DataBlock,animations);
    }
    else if(args.Length>4)exporter.AnimationFilter.UnionWith(args[4].Split(','));
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[3]))!);
    if(args[0]!="clip-events")exporter.Export(resource,args[3]);
    if(resource.DataBlock is ValveResourceFormat.ResourceTypes.ModelAnimation2.AnimationClip clip)
    {
        var sounds=clip.Events.OfType<ValveResourceFormat.ResourceTypes.ModelAnimation2.NmSoundEvent>().Select(e=>new{name=e.Name,at=e.StartTime}).ToArray();
        var markers=clip.Events.OfType<ValveResourceFormat.ResourceTypes.ModelAnimation2.NmIDEvent>().Select(e=>new{id=e.ID,secondary=e.SecondaryID,at=e.StartTime,duration=e.Duration}).ToArray();
        File.WriteAllText(args[3]+".events.json",JsonSerializer.Serialize(new{source=args[2],duration=clip.Duration,frames=clip.NumFrames,additive=clip.IsAdditive,skeleton=clip.SkeletonName,sounds,markers}));
    }
    Console.WriteLine("Exported with current VRF library: "+args[3]);
    return 0;
}

if (args.Length != 3 || args[0] != "nav")
{
    Console.Error.WriteLine("Usage: source2-helper nav <de_dust2.nav> <navigation.json>");
    return 1;
}
var nav = new NavMeshFile();
nav.Read(args[1]);
static float[] ConvertPoint(Vector3 p) => [p.X * 0.0254f, p.Z * 0.0254f, -p.Y * 0.0254f];
var areas = nav.Areas.Values.Where(a => a.HullIndex == 0).OrderBy(a => a.AreaId).Select(a => new
{
    id = a.AreaId,
    flags = ((long)a.AttributeFlags).ToString(),
    flagNames = a.AttributeFlags.ToString(),
    vertices = a.Corners.Select(ConvertPoint).ToArray(),
    connections = a.Connections.SelectMany((connections, edge) => connections.Select(c => new
    {
        area = c.AreaId, fromEdge = edge, targetEdge = c.EdgeId,
    })).ToArray(),
}).ToArray();
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[2]))!);
File.WriteAllText(args[2], JsonSerializer.Serialize(new { version = nav.Version, subVersion = nav.SubVersion, areas }));
Console.WriteLine($"Exported {areas.Length} original navigation areas and their directed connections.");
return 0;
